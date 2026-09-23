import { smartGroupComponents,artboardOwners } from './smart-group.js';
/**
 * 工作区：组合宿主适配器、调度器、快照缓存、查询与选择服务、模块生命周期与设置。
 * 面板与模块只通过本类暴露的端口交互，不直接触碰适配器全局对象。
 */

import {
  CoreError,
  DEFAULT_APP_SETTINGS,
} from '@aiq/contracts';
import type {
  AppSettings,
  ApplySymmetryRequest,
  ApplyTextStyleRequest,
  ApplyTransformRequest,
  CommandResult,
  ConvertOutlinesRequest,
  DocumentContext,
  ExportFilesRequest,
  HostAdapter,
  HostCapabilities,
  HostInfo,
  ModuleBundle,
  ModuleContext,
  QueryRequest,
  QueryResult,
  QueryScope,
  ReplaceObjectsRequest,
  SettingsStorePort,
  Snapshot,
  TextStyleChange,
} from '@aiq/contracts';
import { EventBus } from './events.js';
import { Scheduler } from './scheduler.js';
import { ModuleRegistry } from './registry.js';
import { resolveQuery } from './query-engine.js';
import { Logger } from './logger.js';
import type { EditorAction, EditorResult, EditorState } from '@aiq/contracts';

export interface WorkspaceEvents extends Record<string, unknown> {
  'editor-state-changed': EditorState | null;
  'host-info-changed': HostInfo;
  'document-changed': DocumentContext | null;
  'snapshot-updated': Snapshot;
  'result-updated': QueryResult | null;
  'modules-changed': undefined;
  'command-finished': { label: string; result: CommandResult };
  'settings-changed': AppSettings;
  'settings-corrupted': undefined;
  'scope-changed': QueryScope;
  'error': { message: string; detail?: string };
}

function scopeKey(scope: QueryScope): string {
  const keys: Array<[string, unknown]> = [
    ['kind', scope.kind],
    ['artboardId', scope.artboardId ?? ''],
    ['layerName', scope.layerName ?? ''],
    ['pierceGroups', scope.pierceGroups],
    ['pierceClipGroups', scope.pierceClipGroups],
    ['includeMaskPaths', scope.includeMaskPaths],
    ['includeHidden', scope.includeHidden],
    ['includeLocked', scope.includeLocked],
  ];
  keys.sort((a, b) => a[0].localeCompare(b[0]));
  return keys.map(([k, v]) => `${k}=${String(v)}`).join('&');
}

/** 初始化前不开放真实宿主能力，避免方法存在被误认成已验证。 */
function initialCapabilities(adapter: HostAdapter): HostCapabilities {
  const claim = (supported: boolean, note?: string) => ({
    supported: adapter.kind === 'demo' && supported,
    verifiedOnHost: false,
    note,
  });
  return {
    connect: claim(true),
    readDocumentContext: claim(true),
    readArtboards: claim(true),
    collectSnapshot: claim(true),
    selectObjects: claim(true),
    sampleTextSpanFormats: claim(true),
    documentChangeEvents: claim(false, '未验证，使用显式刷新与执行前复核'),
    persistentObjectId: claim(adapter.kind === 'demo', '演示样例内稳定；真实宿主未验证'),
    readPathPoints: claim(adapter.kind === 'demo', '以初始化能力推断；以适配器自报为准'),
    writeTextStyles: claim(typeof adapter.applyTextStyles === 'function'),
    transformObjects: claim(typeof adapter.applyTransforms === 'function'),
    replaceObjects: claim(typeof adapter.replaceObjects === 'function'),
    writePathPoints: claim(typeof adapter.applySymmetry === 'function'),
    convertTextToOutlines: claim(typeof adapter.convertTextToOutlines === 'function'),
    exportFiles: claim(typeof adapter.exportFiles === 'function'),
    undoWrite: claim(typeof adapter.undoWrite === 'function'),
  };
}

export interface WorkspaceOptions {
  adapter: HostAdapter;
  settingsStore: SettingsStorePort;
  debugLogs?: boolean;
}

export class Workspace {
  readonly events = new EventBus<WorkspaceEvents>();
  readonly registry = new ModuleRegistry();
  readonly scheduler: Scheduler;
  private editorState: EditorState | null = null;
  private documentBleed: { session: string; offsets: number[] } | null = null;
  getDocumentBleed(): number[] | null {
    const bleed = this.documentBleed, state = this.editorState;
    return bleed && state && bleed.session === state.docSessionId ? [...bleed.offsets] : null;
  }
  private editorEpoch = 0;
  private editorReads = new Map<string, Promise<EditorState | null>>();
  private releaseEditorNeeded = false;
  readonly log = new Logger('aiq-core');

  private hostInfo: HostInfo;
  private document: DocumentContext | null = null;
  private snapshotCache = new Map<string, Snapshot>();
  private result: QueryResult | null = null;
  private undoableSession: string | null = null;
  private settings: AppSettings;
  private scopeValue: QueryScope;
  private scopeListeners = new Set<(scope: QueryScope) => void>();
  private disposed = false;
  private settingsCorrupted = false;
  private settingsSaveFailed = false;

  constructor(private readonly options: WorkspaceOptions) {
    this.scheduler = new Scheduler(() => options.adapter.waitForHostIdle?.() ?? Promise.resolve());
    this.hostInfo = {
      adapterKind: options.adapter.kind,
      displayName: options.adapter.kind === 'demo' ? '演示适配器（合成样例）' : 'Illustrator（CEP 桥接）',
      connection: 'disconnected',
      // 初始能力按适配器方法存在性推断；initialize 后以适配器自报为准。
      capabilities: initialCapabilities(options.adapter),
      limitations: [],
    };
    this.settings = this.loadSettings();
    const pref = this.settings.scopePreference;
    this.scopeValue = {
      kind: pref.kind,
      pierceGroups: pref.pierceGroups,
      pierceClipGroups: pref.pierceClipGroups,
      includeMaskPaths: pref.includeMaskPaths,
      includeHidden: pref.includeHidden,
      includeLocked: pref.includeLocked,
    };
  }

  private loadSettings(): AppSettings {
    try {
      const loaded = this.options.settingsStore.load();
      if (loaded && loaded.version === 1) return loaded;
      throw new Error('版本不符');
    } catch {
      // 损坏配置回退默认值；构造期监听器未注册，延迟到 initialize 提示。
      this.settingsCorrupted = true;
      return { ...DEFAULT_APP_SETTINGS, enabledModules: {}, scopePreference: { ...DEFAULT_APP_SETTINGS.scopePreference } };
    }
  }

  getHostInfo(): HostInfo {
    return this.hostInfo;
  }

  getDocument(): DocumentContext | null {
    return this.document;
  }

  getEditorState(): EditorState | null { return this.editorState; }
  async getEditorRevision(): Promise<string | null> {
    if (!this.scheduler.isIdle() || !this.options.adapter.getEditorRevision) return null;
    const epoch=this.editorEpoch;
    const raw=await this.scheduler.run('getEditorRevision', () => this.options.adapter.getEditorRevision!());
    if(epoch!==this.editorEpoch)return null;
    if(!raw.startsWith('{'))return raw;
    const pulse=JSON.parse(raw) as {revision:string;docSessionId:string;activeArtboard:number;artboard:EditorState['artboards'][number];rulerUnit:EditorState['rulerUnit'];layers:EditorState['layers']};
    const old=this.editorState;
    if(old&&old.docSessionId===pulse.docSessionId&&Number.isInteger(pulse.activeArtboard)&&pulse.activeArtboard>=0&&pulse.activeArtboard<old.artboards.length&&pulse.artboard?.index===pulse.activeArtboard&&Array.isArray(pulse.artboard.bounds)&&pulse.artboard.bounds.length===4&&pulse.artboard.bounds.every(Number.isFinite)){
      const current=old.artboards[pulse.activeArtboard];
      if(old.activeArtboard!==pulse.activeArtboard||JSON.stringify(current)!==JSON.stringify(pulse.artboard)||old.rulerUnit!==pulse.rulerUnit||JSON.stringify(old.layers)!==JSON.stringify(pulse.layers)){
        const artboards=[...old.artboards];artboards[pulse.activeArtboard]=pulse.artboard;
        this.editorState={...old,activeArtboard:pulse.activeArtboard,artboards,rulerUnit:pulse.rulerUnit,layers:pulse.layers};
        this.events.emit('editor-state-changed',this.editorState);
      }
    }
    return pulse.revision;
  }
  onEditorState(listener: (state: EditorState | null) => void): () => void { return this.events.on('editor-state-changed', listener); }
  cancelEditorRequests(release = true): void {
    this.editorEpoch++;
    this.scheduler.cancelPending();
    this.editorReads.clear();
    if (!release) return;
    this.editorState = null;
    this.events.emit('editor-state-changed', null);
    this.releaseEditorNeeded = true;
    if (this.scheduler.isIdle() && this.options.adapter.releaseEditorState) {
      this.releaseEditorNeeded = false;
      void this.scheduler.run('releaseEditorState', () => this.options.adapter.releaseEditorState!()).catch(() => { this.releaseEditorNeeded = true; });
    }
  }
  readEditorState(profile: 'document' | 'selection' | 'properties' = 'selection', signal?:AbortSignal): Promise<EditorState | null> {
    const fn = this.options.adapter.readEditorState;
    if (!fn) return Promise.resolve(null);
    // Automatic reads never lend a cancellable promise to an explicit command.
    const existing = signal ? undefined : this.editorReads.get(profile);
    if (existing) return existing;
    const epoch = this.editorEpoch;
    const pending = this.scheduler.run('readEditorState', async () => {
      if (this.releaseEditorNeeded && this.options.adapter.releaseEditorState) {
        await this.options.adapter.releaseEditorState(); this.releaseEditorNeeded = false;
      }
      if (epoch !== this.editorEpoch || signal?.aborted) throw new CoreError({code:'OPERATION_CANCELLED',message:'读取已取消'});
      return fn.call(this.options.adapter, profile);
    }, {signal}).then(state => {
      if (epoch !== this.editorEpoch || signal?.aborted) throw new CoreError({code:'OPERATION_CANCELLED', message:'已丢弃离开工具前的读取结果'});
      const changed = (state?.docSessionId ?? null) !== (this.document?.sessionId ?? null);
      if (state?.docName) this.document = {sessionId:state.docSessionId,name:state.docName,isOpen:true,flags:{unsavedChanges:state.unsaved},activeArtboardId:'ab-'+state.activeArtboard};
      else if (!state) this.document = null;
      if (changed) { this.snapshotCache.clear(); this.events.emit('document-changed', this.document); }
      if (!state) this.documentBleed=null;
      else if ('bleedOffsets' in state) { const b=state.bleedOffsets; this.documentBleed=b?.length===4&&b.every(n=>Number.isFinite(n)&&n>=0)?{session:state.docSessionId,offsets:[...b]}:null; }
      this.editorState = state;
      this.events.emit('editor-state-changed', state);
      return state;
    }).finally(() => { if (this.editorReads.get(profile) === pending) this.editorReads.delete(profile); });
    if(!signal)this.editorReads.set(profile, pending);
    return pending;
  }

  onEditorChange(listener:()=>void):()=>void { return this.events.on('command-finished',listener); }

  selectNativeTool(tool:'selection'|'text'|'artboard',signal?:AbortSignal):Promise<{tool:string}>{
    const fn=this.options.adapter.selectNativeTool;
    if(!fn)throw new CoreError({code:'CAPABILITY_UNSUPPORTED',message:'当前环境尚不支持原生工具联动'});
    const docSessionId=this.document?.sessionId;
    return this.scheduler.run('selectNativeTool',()=>fn.call(this.options.adapter,tool,docSessionId),{signal});
  }

  async editDocument(state: EditorState, action: EditorAction, signal?: AbortSignal): Promise<EditorResult> {
    const independent=action.type==='export'&&action.rasterEngine==='independent';
    if(independent&&this.activeIndependentExport)throw new CoreError({code:'HOST_COMMAND_REJECTED',message:'独立导出任务仍在运行，请等待完成或取消后续导出'});
    if(independent)this.activeIndependentExport=action.jobId??'';
    try{return await this.runEditorAction(state,action,signal);}
    finally{if(independent)this.activeIndependentExport='';}
  }
  private activeIndependentExport='';
  isExportRunning(jobId:string):boolean{return !!jobId&&jobId===this.activeIndependentExport;}
  private async runEditorAction(state: EditorState, action: EditorAction, signal?: AbortSignal): Promise<EditorResult> {
    if(action.type==='productivity'&&!this.registry.isActive('productivity'))throw new CoreError({code:'MODULE_NOT_ACTIVE',message:'生产辅助工具已关闭'});
    const fn = this.options.adapter.editDocument;
    if (!fn || !this.hostInfo.capabilities.editorTools?.supported) throw new CoreError({code:'CAPABILITY_UNSUPPORTED',message:'此操作需要已验证的 Illustrator 编辑接口'});
    // A failed explicit refresh must not leave an older bleed value looking current.
    if(action.type==='read-bleed')this.documentBleed=null;
    const request={docSessionId:state.docSessionId,token:state.token,action};
    let result = await this.scheduler.run('editDocument', async () => {
      const measured=await fn.call(this.options.adapter,request);
      if(action.type==='artboards-update'&&measured.boardRegions&&measured.ownershipBoards){if(signal?.aborted)throw new Error('操作已取消');return fn.call(this.options.adapter,{...request,action:{...action,artworkAssignments:artboardOwners(measured.boardRegions,measured.ownershipBoards)}});}
      if(action.type!=='smart-group'||action.groups||measured.status!=='completed')return measured;
      if(!measured.groupRegions)throw new Error('宿主未返回可见区域');
      const groups=smartGroupComponents(measured.groupRegions);
      if(signal?.aborted)throw new Error('操作已取消');
      return fn.call(this.options.adapter,{...request,action:{type:'smart-group',groups}});
    }, {signal,timeoutMs:action.type==='artboards-update'||action.type==='native'||action.type==='save'||action.type==='export'||action.type==='package'||action.type==='text-search'||action.type==='object-search'||action.type==='variable-data'||action.type==='choose-folder'||action.type==='read-bleed'||action.type==='pick-color'?610000:31000}).catch(error=>{
      if(action.type==='export'&&action.rasterEngine==='independent'&&error instanceof CoreError&&error.code==='HOST_TIMEOUT'&&this.options.adapter.recoverRasterPreparation)return this.options.adapter.recoverRasterPreparation(request);
      throw error;
    });
    if(result.rasterJob){if(!this.options.adapter.finishRasterExport)throw new Error('独立渲染适配器不可用');result=await this.options.adapter.finishRasterExport(result);}
    if(action.type==='read-bleed') { const b=result.bleedOffsets; this.documentBleed=result.status==='completed'&&b?.length===4&&b.every(n=>Number.isFinite(n)&&n>=0)?{session:state.docSessionId,offsets:[...b]}:null; }
    if (result.sideEffects.length) { this.snapshotCache.clear(); this.undoableSession = result.undoable ? state.docSessionId : null; }
    this.events.emit('command-finished', {label:'editDocument',result});
    return result;
  }

  supportsExportProgress(): boolean { return this.options.adapter.supportsExportProgress?.()??false; }
  readExportProgress(jobId: string) { return this.options.adapter.readExportProgress?.(jobId)??Promise.resolve(null); }
  cancelExport(jobId: string) { return this.options.adapter.cancelExport?.(jobId)??Promise.reject(new Error('当前环境不支持取消导出')); }

  getSettings(): AppSettings {
    return this.settings;
  }
  getSettingsStorageStatus(){const status=this.options.settingsStore.status?.()??{location:'浏览器本地设置'};return this.settingsSaveFailed?{...status,warning:'设置暂时无法保存，当前修改仅在本次会话生效。请检查设置目录后重试。'}:status;}
  chooseFolder(initial?:string):Promise<string|null>{
    const fn=this.options.adapter.chooseFolder;
    if(!fn)return Promise.reject(Error('当前环境不支持系统文件夹窗口，请粘贴路径'));
    return this.scheduler.run('chooseFolder',()=>fn.call(this.options.adapter,initial),{timeoutMs:610000});
  }

  // -----------------------------------------------------------------------
  // 查询范围（壳层范围条状态）

  currentScope(): QueryScope {
    return this.scopeValue;
  }

  applyScope(scope: QueryScope): void {
    this.scopeValue = scope;
    // 范围偏好只持久化形态与开关，不含文档内对象指针。
    this.settings = {
      ...this.settings,
      scopePreference: {
        kind: scope.kind,
        pierceGroups: scope.pierceGroups,
        pierceClipGroups: scope.pierceClipGroups,
        includeMaskPaths: scope.includeMaskPaths,
        includeHidden: scope.includeHidden,
        includeLocked: scope.includeLocked,
      },
    };
    this.options.settingsStore.save(this.settings);
    for (const listener of this.scopeListeners) listener(scope);
    this.events.emit('scope-changed', scope);
  }

  onScopeChange(listener: (scope: QueryScope) => void): () => void {
    this.scopeListeners.add(listener);
    return () => {
      this.scopeListeners.delete(listener);
    };
  }

  updateSettings(patch: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...patch };
    // A preferences write failure must not throw from input handlers or mount
    // effects and take down the panel. Keep the draft and expose persistence status.
    try { this.options.settingsStore.save(this.settings); this.settingsSaveFailed=false; }
    catch { this.settingsSaveFailed=true; }
    this.events.emit('settings-changed', this.settings);
  }

  // -----------------------------------------------------------------------
  // 连接与文档

  async initialize(): Promise<void> {
    if (this.settingsCorrupted) {
      this.events.emit('settings-corrupted', undefined);
    }
    try {
      this.hostInfo = await this.scheduler.run('connect', () => this.options.adapter.connect());
      this.events.emit('host-info-changed', this.hostInfo);
      if (this.hostInfo.connection === 'connected') await this.refreshDocumentContext();
    } catch (error) {
      this.hostInfo={...this.hostInfo,connection:'disconnected',capabilities:initialCapabilities(this.options.adapter),lastError:{code:'HOST_NOT_CONNECTED',message:'连接或文档读取未完成，请处理 Illustrator 对话框后手动重新连接。'}};
      this.events.emit('host-info-changed',this.hostInfo);
      throw error;
    }
  }

  /** 重新读取文档身份；会话变化时保守失效全部快照与引用。 */
  async refreshDocumentContext(): Promise<DocumentContext | null> {
    let next: DocumentContext;
    try {
      next = await this.scheduler.run('getDocumentContext', () => this.options.adapter.getDocumentContext());
    } catch (error) {
      if (error instanceof CoreError && error.code === 'NO_DOCUMENT') {
        const hadDocument = this.document !== null;
        this.document = null;
        this.snapshotCache.clear();
        if (hadDocument) this.events.emit('document-changed', null);
        return null;
      }
      throw error;
    }
    const changed = this.document === null || this.document.sessionId !== next.sessionId;
    this.document = next;
    if (changed) {
      // 文档身份变化：快照与引用全部失效（B03）。
      // 旧查询结果保留展示，选择动作执行时给出精确失效错误。
      this.snapshotCache.clear();
      this.events.emit('document-changed', next);
    }
    return next;
  }

  async switchDocument(sessionId: string): Promise<DocumentContext> {
    const next = await this.scheduler.run('setActiveDocument', () =>
      this.options.adapter.setActiveDocument(sessionId),
    );
    this.snapshotCache.clear();
    this.document = next;
    // 同上：保留旧结果用于精确失效提示。
    this.events.emit('document-changed', next);
    return next;
  }

  async listDocuments(): Promise<DocumentContext[]> {
    return this.scheduler.run('listDocuments', () => this.options.adapter.listDocuments());
  }

  // -----------------------------------------------------------------------
  // 快照与查询

  async ensureSnapshot(scope: QueryScope, opts: { forceRefresh?: boolean;readOnly?: boolean } = {}): Promise<Snapshot> {
    if (this.disposed) throw new CoreError({ code: 'INTERNAL_ERROR', message: '工作区已释放' });
    const epoch = this.editorEpoch;
    const doc = (await this.refreshDocumentContext()) ?? this.document;
    if (epoch !== this.editorEpoch) throw new CoreError({code:'OPERATION_CANCELLED',message:'工具已退出，取消扫描'});
    if (!doc) throw new CoreError({ code: 'NO_DOCUMENT', message: '没有打开的文档' });

    const key = `${doc.sessionId}::${scopeKey(scope)}::${opts.readOnly?'analysis':'full'}`;
    if (!opts.forceRefresh) {
      const cached = this.snapshotCache.get(key);
      if (cached) return cached;
    }
    const snapshot = await this.scheduler.run('collectSnapshot', () =>
      this.options.adapter.collectSnapshot(scope,{readOnly:opts.readOnly}),{timeoutMs:181000},
    );
    if (epoch !== this.editorEpoch) throw new CoreError({code:'OPERATION_CANCELLED',message:'已丢弃退出工具前的扫描'});
    this.snapshotCache.set(key, snapshot);
    this.events.emit('snapshot-updated', snapshot);
    return snapshot;
  }

  currentSnapshot(): Snapshot | null {
    if (!this.document) return null;
    for (const snap of this.snapshotCache.values()) {
      if (snap.docSessionId === this.document.sessionId) return snap;
    }
    return null;
  }

  invalidateSnapshots(): void {
    this.snapshotCache.clear();
  }

  async resolveQuery(request: QueryRequest): Promise<QueryResult> {
    const snapshot = await this.ensureSnapshot(request.scope);
    const result = resolveQuery(snapshot, request);
    this.result = result;
    this.events.emit('result-updated', result);
    return result;
  }

  currentResult(): QueryResult | null {
    return this.result;
  }

  hasUndoableWrite(): boolean {
    return this.hostInfo.capabilities.undoWrite.supported && this.undoableSession !== null && this.undoableSession === this.document?.sessionId;
  }

  clearResult(): void {
    this.result = null;
    this.events.emit('result-updated', null);
  }

  // -----------------------------------------------------------------------
  // 选择（执行前复核引用；受限目标跳过，不解锁不取消隐藏）

  async selectFromCurrentResult(mode: 'objects' | 'locate-containers', locate?: {index?:number;focus:boolean}): Promise<CommandResult> {
    if (!this.hostInfo.capabilities.selectObjects.supported) {
      throw new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '当前宿主尚未开放对象选择' });
    }
    const result = this.result;
    if (!result) {
      throw new CoreError({ code: 'SELECTION_EMPTY', message: '当前没有可用的查询结果' });
    }
    const doc = await this.refreshDocumentContext();
    if (!doc || doc.sessionId !== result.docSessionId) {
      throw new CoreError({
        code: 'DOC_SESSION_MISMATCH',
        message: '文档已切换，结果已失效；请重新查询',
      });
    }
    // 引用新鲜度不在面板侧用时间戳判断：把结果携带的采集标记传给适配器，
    // 由适配器端重新解析并校验（宿主无持久 ID 时的规定行为）。

    let objectIds: string[];
    if (mode === 'objects') {
      objectIds = result.objects.map((o) => o.objectId);
    } else {
      objectIds = [...new Set(result.textSpans.map((s) => s.containerObjectId))];
    }
    if(locate?.index!==undefined){const selectedId=objectIds[locate.index];if(!selectedId)throw new CoreError({code:'REF_STALE',message:'定位结果已失效'});objectIds=[selectedId];}
    if (objectIds.length === 0) {
      return {
        status: 'completed',
        selectedObjectIds: [],
        skipped: [],
        sideEffects: [],
      };
    }

    const commandResult = await this.scheduler.run('selectObjects', () =>
      this.options.adapter.selectObjects({
        docSessionId: result.docSessionId,
        objectIds,
        expectedCollectionStamp: result.collectionStamp,
        focus:locate?.focus,
      }),
    );
    this.events.emit('command-finished', { label: 'selectObjects', result: commandResult });
    return commandResult;
  }

  // -----------------------------------------------------------------------
  // 写入（引用来自当前结果集；统一校验 + 串行调度 + 成功后失效）

  private async executeWrite<TRequest>(
    label: string,
    capability: keyof HostCapabilities,
    buildRequest: (base: { docSessionId: string; expectedCollectionStamp: string }) => TRequest,
    invoke: (request: TRequest) => Promise<CommandResult>,
  ): Promise<CommandResult> {
    const result = this.result;
    if (!result) {
      throw new CoreError({
        code: 'SELECTION_EMPTY',
        message: '当前没有可用的查询结果；请先查询目标，再执行写入',
      });
    }
    const doc = await this.refreshDocumentContext();
    if (!doc || doc.sessionId !== result.docSessionId) {
      throw new CoreError({
        code: 'DOC_SESSION_MISMATCH',
        message: '文档已切换，结果已失效；请重新查询',
      });
    }
    const claim = this.hostInfo.capabilities[capability];
    if (!claim?.supported) {
      throw new CoreError({
        code: 'CAPABILITY_UNSUPPORTED',
        message: `宿主能力不可用：${capability}`,
        detail: claim?.note,
      });
    }
    const request = buildRequest({
      docSessionId: result.docSessionId,
      expectedCollectionStamp: result.collectionStamp,
    });
    const commandResult = await this.scheduler.run(label, () => invoke(request));
    if (commandResult.status === 'completed' || commandResult.status === 'partial' || commandResult.sideEffects.length > 0) {
      // 内容已变化：快照与旧引用全部失效（保守策略）。
      this.snapshotCache.clear();
      this.undoableSession = commandResult.undoable ? doc.sessionId : null;
    }
    this.events.emit('command-finished', { label, result: commandResult });
    return commandResult;
  }

  async applyTextStyleChanges(changes: TextStyleChange[]): Promise<CommandResult> {
    return this.executeWrite<ApplyTextStyleRequest>(
      'applyTextStyles',
      'writeTextStyles',
      (base) => ({ ...base, changes }),
      (request) => {
        const fn = this.options.adapter.applyTextStyles;
        if (!fn) return Promise.reject(new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持文字样式写入' }));
        return fn.call(this.options.adapter, request);
      },
    );
  }

  async applyTransforms(transforms: ApplyTransformRequest['transforms']): Promise<CommandResult> {
    return this.executeWrite<ApplyTransformRequest>(
      'applyTransforms',
      'transformObjects',
      (base) => ({ ...base, transforms }),
      (request) => {
        const fn = this.options.adapter.applyTransforms;
        if (!fn) return Promise.reject(new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持几何变换' }));
        return fn.call(this.options.adapter, request);
      },
    );
  }

  async replaceObjects(
    request: Omit<ReplaceObjectsRequest, 'docSessionId' | 'expectedCollectionStamp'>,
  ): Promise<CommandResult> {
    return this.executeWrite<ReplaceObjectsRequest>(
      'replaceObjects',
      'replaceObjects',
      (base) => ({ ...base, ...request }),
      (full) => {
        const fn = this.options.adapter.replaceObjects;
        if (!fn) return Promise.reject(new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持替换' }));
        return fn.call(this.options.adapter, full);
      },
    );
  }

  async applySymmetry(
    request: Omit<ApplySymmetryRequest, 'docSessionId' | 'expectedCollectionStamp'>,
  ): Promise<CommandResult> {
    return this.executeWrite<ApplySymmetryRequest>(
      'applySymmetry',
      'writePathPoints',
      (base) => ({ ...base, ...request }),
      (full) => {
        const fn = this.options.adapter.applySymmetry;
        if (!fn) return Promise.reject(new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持路径点写回' }));
        return fn.call(this.options.adapter, full);
      },
    );
  }

  async undoWrite(): Promise<CommandResult> {
    const claim = this.hostInfo.capabilities.undoWrite;
    if (!claim?.supported) {
      throw new CoreError({
        code: 'CAPABILITY_UNSUPPORTED',
        message: '当前适配器不支持撤销',
        detail: claim?.note,
      });
    }
    const fn = this.options.adapter.undoWrite;
    if (!fn) {
      throw new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持撤销' });
    }
    const commandResult = await this.scheduler.run('undoWrite', () =>
      fn.call(this.options.adapter),
    );
    if (commandResult.status === 'completed' || commandResult.status === 'partial' || commandResult.sideEffects.length > 0) {
      this.snapshotCache.clear();
      this.undoableSession = null;
    }
    this.events.emit('command-finished', { label: 'undoWrite', result: commandResult });
    return commandResult;
  }

  async convertTextToOutlines(objectIds: string[]): Promise<CommandResult> {
    return this.executeWrite<ConvertOutlinesRequest>(
      'convertTextToOutlines',
      'convertTextToOutlines',
      (base) => ({ ...base, objectIds }),
      (request) => {
        const fn = this.options.adapter.convertTextToOutlines;
        if (!fn) return Promise.reject(new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持转曲' }));
        return fn.call(this.options.adapter, request);
      },
    );
  }

  /** 导出队列：不依赖查询结果集（文档级操作），仅做能力检查与串行调度。 */
  async exportFiles(
    request: Omit<ExportFilesRequest, 'docSessionId'>,
  ): Promise<CommandResult> {
    const claim = this.hostInfo.capabilities.exportFiles;
    if (!claim?.supported) {
      throw new CoreError({
        code: 'CAPABILITY_UNSUPPORTED',
        message: '当前适配器不支持导出',
        detail: claim?.note,
      });
    }
    const fn = this.options.adapter.exportFiles;
    if (!fn) {
      throw new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '适配器不支持导出' });
    }
    const doc = await this.refreshDocumentContext();
    if (!doc) {
      throw new CoreError({ code: 'NO_DOCUMENT', message: '没有打开的文档' });
    }
    const commandResult = await this.scheduler.run('exportFiles', () =>
      fn.call(this.options.adapter, { ...request, docSessionId: doc.sessionId }),
    );
    this.events.emit('command-finished', { label: 'exportFiles', result: commandResult });
    return commandResult;
  }

  // -----------------------------------------------------------------------
  // 模块

  registerModule(bundle: ModuleBundle): void {
    const preferred = this.settings.enabledModules[bundle.manifest.id];
    const registration = this.registry.register(bundle, preferred);
    if (!registration.ok) {
      for (const err of registration.errors) {
        this.log.warn(`模块注册被拒绝：${bundle.manifest.id}`, { code: err.code });
        this.events.emit('error', { message: err.message, detail: err.detail });
      }
      return;
    }
    this.events.emit('modules-changed', undefined);
  }

  async activateModule(moduleId: string): Promise<void> {
    // 停用/激活前等待进行中的宿主动作到达边界。
    await this.scheduler.idle();
    await this.registry.activate(moduleId, this.hostInfo.capabilities, (id) =>
      this.createModuleContext(id),
    );
    this.registry.setPreferredEnabled(moduleId, true);
    this.persistModulePreference(moduleId, true);
    this.events.emit('modules-changed', undefined);
  }

  async deactivateModule(moduleId: string): Promise<void> {
    await this.scheduler.idle();
    await this.registry.deactivate(moduleId);
    this.registry.setPreferredEnabled(moduleId, false);
    const entry = this.registry.get(moduleId);
    if (entry) entry.state = 'disabled';
    this.persistModulePreference(moduleId, false);
    this.events.emit('modules-changed', undefined);
  }

  private persistModulePreference(moduleId: string, enabled: boolean): void {
    this.updateSettings({enabledModules:{...this.settings.enabledModules,[moduleId]:enabled}});
  }

  async runModuleCommand(globalId: string): Promise<void> {
    const sepIndex = globalId.indexOf('.');
    const moduleId = sepIndex > 0 ? globalId.slice(0, sepIndex) : undefined;
    const commandId = sepIndex > 0 ? globalId.slice(sepIndex + 1) : undefined;
    if (!moduleId || !commandId) {
      throw new CoreError({ code: 'MODULE_NOT_ACTIVE', message: `命令 ID 无效：${globalId}` });
    }
    const entry = this.registry.get(moduleId);
    if (!entry) {
      throw new CoreError({ code: 'MODULE_NOT_ACTIVE', message: `命令来源模块不存在：${globalId}` });
    }
    if (!this.registry.isActive(moduleId)) {
      throw new CoreError({
        code: 'MODULE_NOT_ACTIVE',
        message: `模块未启用：${entry.manifest.title}`,
      });
    }
    await entry.bundle.implementation.runCommand(commandId, this.createModuleContext(moduleId));
  }

  /** 激活设置偏好为启用的全部模块。单个失败不阻塞其余（M04）。 */
  async activatePreferredModules(): Promise<string[]> {
    const failures: string[] = [];
    for (const entry of this.registry.list()) {
      const enabled = this.settings.enabledModules[entry.manifest.id] ?? entry.manifest.defaultEnabled;
      if (!enabled) {
        this.registry.setPreferredEnabled(entry.manifest.id, false);
        continue;
      }
      try {
        await this.activateModule(entry.manifest.id);
      } catch {
        failures.push(entry.manifest.id);
      }
    }
    this.events.emit('modules-changed', undefined);
    return failures;
  }

  /** 默认启用可用工具；显式关闭的工具在刷新和重启后保持关闭。 */
  async activateAvailableModules(): Promise<string[]> {
    // A timed-out document read can leave the physical lane busy. Mount the shell
    // without awaiting module activation/idle; reconnect remains an explicit action.
    if(this.hostInfo.connection!=='connected')return [];
    const failed: string[] = [];
    for (const entry of this.registry.list()) {
      if (!(this.settings.enabledModules[entry.manifest.id] ?? entry.manifest.defaultEnabled)) continue;
      if (entry.manifest.requiredCapabilities.some(key => !this.hostInfo.capabilities[key]?.supported)) continue;
      if (this.registry.isActive(entry.manifest.id)) continue;
      try { await this.activateModule(entry.manifest.id); }
      catch { failed.push(entry.manifest.id); }
    }
    return failed;
  }

  createModuleContext(moduleId: string): ModuleContext {
    return {
      moduleId,
      query: {
        resolve: (request) => this.resolveQuery(request),
        currentResult: () => this.currentResult(),
        clearResult: () => this.clearResult(),
      },
      snapshots: {
        ensureSnapshot: (scope, opts) => this.ensureSnapshot(scope, opts),
        currentSnapshot: () => this.currentSnapshot(),
        invalidate: () => this.invalidateSnapshots(),
      },
      selection: {
        selectCurrentResult: () => this.selectFromCurrentResult('objects'),
        locateContainersOfCurrentResult: () => this.selectFromCurrentResult('locate-containers'),
      },
      writes: {
        applyTextStyleChanges: (changes) => this.applyTextStyleChanges(changes),
        applyTransforms: (transforms) => this.applyTransforms(transforms),
        replaceObjects: (request) => this.replaceObjects(request),
        applySymmetry: (request) => this.applySymmetry(request),
        convertTextToOutlines: (objectIds) => this.convertTextToOutlines(objectIds),
        exportFiles: (request) => this.exportFiles(request),
        undo: () => this.undoWrite(),
        currentStamp: () => this.result?.collectionStamp ?? null,
      },
      documents: {
        getContext: () => this.refreshDocumentContext(),
        listDocuments: () => this.listDocuments(),
        setActiveDocument: (sessionId) => this.switchDocument(sessionId),
      },
      scope: {
        current: () => this.currentScope(),
        apply: (scope) => this.applyScope(scope),
        onChange: (listener) => this.onScopeChange(listener),
      },
      scheduler: {
        run: (label, task, opts) => this.scheduler.run(label, task, opts),
      },
      log: new Logger(`module:${moduleId}`, { debug: this.options.debugLogs }),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.cancelEditorRequests();
    for (const entry of this.registry.list()) {
      if (entry.state === 'active') {
        void entry.bundle.implementation.onDeactivate().catch(() => undefined);
      }
    }
    this.snapshotCache.clear();
  }
}
