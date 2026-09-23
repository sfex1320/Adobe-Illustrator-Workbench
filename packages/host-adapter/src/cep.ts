import { cepUserFiles } from './user-files.js';
import { chooseSystemFolder } from './folder-picker.js';
import {finishRasterExport,requireRasterRuntime} from './raster.js';
import {ExportPreparationController} from './export-job-controller.js';
import {parseExportProgress} from './export-job-store.js';
import type { ExportProgress } from '@aiq/contracts';
/**
 * CEP 宿主适配器：通过 CepBridge 实现 HostAdapter。
 *
 * 0.2.0：读取、选择、受限普通路径变换与局部恢复经过 Illustrator 30.0.0 COM 实测。
 * 其他写入仍关闭；浏览器界面/内部联调与原生 CEP 面板验收分别报告。
 * 宿主脚本 host/cep/com.aiq.workbench/hostscript.jsx 需与白名单命令一一对应。
 */

import { CoreError } from '@aiq/contracts';
import { graphemeCount } from '@aiq/core';
import type {
  ApplySymmetryRequest,
  ApplyTextStyleRequest,
  ApplyTransformRequest,
  CommandResult,
  ConvertOutlinesRequest,
  DocumentContext,
  ExportFilesRequest,
  HostAdapter,
  HostInfo,
  QueryScope,
  ReplaceObjectsRequest,
  SelectRequest,
  Snapshot,
} from '@aiq/contracts';
import type { CepBridge } from './bridge.js';
import type { EditorRequest, EditorResult, EditorState } from '@aiq/contracts';
import { type BridgeDiagnostics } from './bridge.js';

const UNVERIFIED = '审查发现宿主实现风险；本测试安装版禁用写入，演示实现不代表实机可用';

function cepCapabilities(version?: string): HostInfo['capabilities'] {
  const read = { supported: version === '30.0.0', verifiedOnHost: version === '30.0.0', note: '仅 Illustrator 30.0.0 宿主脚本通过实测；见审查报告的覆盖限制' };
  return {
    editorTools: { ...read, note: '属性、文字框、尺寸、画板、替换、六格式导出。对称功能已按用户要求取消。' },
    connect: read,
    readDocumentContext: read,
    readArtboards: read,
    collectSnapshot: read,
    selectObjects: read,
    sampleTextSpanFormats: { supported: false, verifiedOnHost: false, note: '尚未读取用户选中一两个字的原生样式样本' },
    documentChangeEvents: {
      supported: false,
      verifiedOnHost: false,
      note: '使用显式刷新与执行前复核',
    },
    persistentObjectId: {
      supported: false,
      verifiedOnHost: false,
      note: '当前实现使用快照内原生对象引用和执行前复核，不持久保存对象 ID',
    },
    readPathPoints: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    writeTextStyles: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    transformObjects: { ...read, note: '仅可编辑普通路径的几何缩放与位置调整；保留控制柄和描边宽度。不支持蒙版路径、文字与复杂容器。' },
    replaceObjects: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    writePathPoints: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    convertTextToOutlines: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    exportFiles: { supported: false, verifiedOnHost: false, note: UNVERIFIED },
    undoWrite: { ...read, note: '仅恢复本插件最后一次路径几何调整；不调用全局撤销，外部编辑后拒绝覆盖。' },
  };
}

interface PingResponse {
  appName: string;
  appVersion: string;
  documentCount: number;
}

interface DocContextResponse {
  sessionId: string;
  name: string;
  unsavedChanges: boolean;
  activeArtboardId?: string;
  noDocument: boolean;
}

export class CepHostAdapter implements HostAdapter {
  selectNativeTool(tool:'selection'|'text'|'artboard',docSessionId?:string):Promise<{tool:string}>{return this.bridge.send('SELECT_NATIVE_TOOL',{tool,docSessionId});}
  private preparation?:ExportPreparationController;
  readonly kind = 'cep' as const;
  private connected = false;
  private lastError: HostInfo['lastError'];
  private hostVersion?: string;
  private hostName?: string;

  constructor(private readonly bridge: CepBridge) {}

  getEditorRevision(): Promise<string> { return this.bridge.send('GET_EDITOR_REVISION'); }
  readEditorState(profile: 'document' | 'selection' | 'properties' = 'selection'): Promise<EditorState | null> { return this.bridge.send('GET_EDITOR_STATE', { profile }); }
  waitForHostIdle(): Promise<void> { return this.bridge.idle(); }
  releaseEditorState(): Promise<void> { return this.bridge.send('RELEASE_EDITOR_STATE'); }
  chooseFolder(initial?:string){return chooseSystemFolder(initial);}
  async finishRasterExport(prepared:EditorResult):Promise<EditorResult>{if(!prepared.rasterJob)return prepared;return finishRasterExport(prepared.rasterJob);}
  editDocument(request: EditorRequest): Promise<EditorResult> {
    if(request.action.type==='export'&&request.action.rasterEngine==='independent'){
      requireRasterRuntime();const disk=cepUserFiles()!;
      this.preparation??=new ExportPreparationController(this.bridge,disk,()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''));
      return this.preparation.start(request);
    }
    if(request.action.type==='choose-folder')return this.chooseFolder().then(folder=>({status:'completed',message:folder?'已设置项目目录':'已取消',selectedObjectIds:[],skipped:[],sideEffects:[],...(folder?{folder}:{})}));return this.bridge.send('EDIT_DOCUMENT', { ...request }, request.action.type==='artboards-update'||request.action.type==='save'||request.action.type==='export'||request.action.type==='package'||request.action.type==='text-search'||request.action.type==='object-search'||request.action.type==='variable-data'||request.action.type==='read-bleed'||request.action.type==='pick-color'?600000:30000);
  }
  recoverRasterPreparation(request:EditorRequest):Promise<EditorResult>{if(!this.preparation)return Promise.reject(Error('没有本次任务的在途所有权'));return this.preparation.recover(request);}

  supportsExportProgress():boolean { return cepUserFiles()!==null; }
  async readExportProgress(jobId:string):Promise<ExportProgress|null> {
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId))return null;
    const raw=cepUserFiles()?.read('export-'+jobId+'.json');if(!raw)return null;
    try{const p=parseExportProgress(raw,jobId);if(!p)return null;if(this.preparation?.isUncertain(jobId)){p.phase='host-uncertain';p.message='宿主尚未确认结束；原调用返回后会核对准备凭据并接续，请勿重复导出';}return p;}catch{return null;}
  }
  async cancelExport(jobId:string):Promise<void> {
    if(!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId))throw Error('导出任务无效');
    const disk=cepUserFiles();if(!disk)throw Error('当前环境无法请求取消');disk.write('export-'+jobId+'.cancel','cancel');
  }

  getDiagnostics(): BridgeDiagnostics {
    return this.bridge.diagnostics;
  }

  async getHostInfo(): Promise<HostInfo> {
    return this.buildInfo();
  }

  private buildInfo(): HostInfo {
    return {
      adapterKind: 'cep',
      displayName: this.connected ? `Illustrator ${this.hostVersion ?? ''}（CEP）`.trim() : 'Illustrator（CEP，未连接）',
      connection: this.connected ? 'connected' : 'disconnected',
      hostName: this.hostName,
      hostVersion: this.hostVersion,
      capabilities: cepCapabilities(this.hostVersion),
      limitations: [
        '0.4.0：六格式导出与原生选色器；曲线/群组/蒙版采用镜像组合，尚无复杂布尔融合',
        '字体与颜色统计跳过串接文字；颜色覆盖普通路径和文字填描，不含多重外观和复杂容器',
        '剪切组按对象查询，不计算裁切后实际可见面积；文字片段只能定位容器，不能原生非连续多选',
        '查询按需刷新；返回面板按需读取选区，写入前复核。实测版本：Windows Illustrator 30.0.0',
      ],
      lastError: this.lastError,
    };
  }

  async connect(): Promise<HostInfo> {
    try {
      const pong = await this.bridge.send<PingResponse>('PING');
      this.hostName = pong.appName;
      this.hostVersion = pong.appVersion;
      this.connected = true;
      this.lastError = undefined;
    } catch (e) {
      this.connected = false;
      this.lastError = e instanceof CoreError ? e.toInfo() : { code: 'HOST_NOT_CONNECTED', message: '连接失败' };
    }
    return this.buildInfo();
  }

  async getDocumentContext(): Promise<DocumentContext> {
    const doc = await this.bridge.send<DocContextResponse>('GET_DOCUMENT_CONTEXT');
    if (doc.noDocument) {
      // 无文档是正常状态，不是连接失败。
      throw new CoreError({ code: 'NO_DOCUMENT', message: 'Illustrator 中没有打开的文档' });
    }
    return {
      sessionId: doc.sessionId,
      name: doc.name,
      isOpen: true,
      flags: { unsavedChanges: doc.unsavedChanges },
      activeArtboardId: doc.activeArtboardId,
    };
  }

  async listDocuments(): Promise<DocumentContext[]> {
    // CEP 首版限制：ExtendScript 可枚举文档名，但面板切换活动文档未验证。
    const current = await this.getDocumentContext().catch(() => null);
    if (!current) return [];
    return [current];
  }

  async setActiveDocument(): Promise<DocumentContext> {
    throw new CoreError({
      code: 'CAPABILITY_UNSUPPORTED',
      message: 'CEP 首版不支持切换活动文档；请在 Illustrator 中切换',
    });
  }

  async collectSnapshot(scope: QueryScope, options?: {readOnly?: boolean}): Promise<Snapshot> {
    if (!cepCapabilities(this.hostVersion).collectSnapshot.supported) {
      throw new CoreError({ code: 'CAPABILITY_UNSUPPORTED', message: '本测试版仅启用经过验证的 Illustrator 30.0.0' });
    }
    const snapshot = await this.bridge.send<Snapshot>('COLLECT_SNAPSHOT', { scope,readOnly:options?.readOnly===true },180000);
    snapshot.collectedAtIso = new Date().toISOString();
    for (const span of snapshot.textSpans) span.graphemeCount = graphemeCount(span.text);
    return snapshot;
  }

  async selectObjects(request: SelectRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('SELECT_OBJECTS', {
      docSessionId: request.docSessionId,
      objectIds: request.objectIds,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
    });
  }

  async applyTextStyles(request: ApplyTextStyleRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('SET_TEXT_STYLES', {
      docSessionId: request.docSessionId,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
      changes: request.changes,
    });
  }

  async applyTransforms(request: ApplyTransformRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('APPLY_TRANSFORMS', {
      docSessionId: request.docSessionId,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
      transforms: request.transforms,
    });
  }

  async replaceObjects(request: ReplaceObjectsRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('REPLACE_OBJECTS', {
      docSessionId: request.docSessionId,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
      sourceObjectId: request.sourceObjectId,
      targetObjectIds: request.targetObjectIds,
      mode: request.mode,
      removeTargets: request.removeTargets,
    });
  }

  async applySymmetry(request: ApplySymmetryRequest): Promise<CommandResult> {
    // 宿主脚本会拒绝该命令；保留接口供后续重新实现与验证。
    return this.bridge.send<CommandResult>('APPLY_SYMMETRY', {
      docSessionId: request.docSessionId,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
      spec: request.spec,
      items: request.items,
      live: request.live === true,
    });
  }

  async convertTextToOutlines(request: ConvertOutlinesRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('CONVERT_OUTLINES', {
      docSessionId: request.docSessionId,
      expectedCollectionStamp: request.expectedCollectionStamp ?? '',
      objectIds: request.objectIds,
    });
  }

  async exportFiles(request: ExportFilesRequest): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('EXPORT_FILES', {
      docSessionId: request.docSessionId,
      tasks: request.tasks,
      targetFolderHint: request.targetFolderHint ?? '',
    });
  }

  async undoWrite(): Promise<CommandResult> {
    return this.bridge.send<CommandResult>('UNDO_WRITE');
  }
}
