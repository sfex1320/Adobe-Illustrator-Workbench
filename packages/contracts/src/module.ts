import type { MODULE_CONTRACT_VERSION } from './ids.js';
import type { CoreErrorInfo } from './errors.js';
import type {
  ApplySymmetryRequest,
  ApplyTransformRequest,
  CommandResult,
  DocumentContext,
  ExportFilesRequest,
  QueryRequest,
  QueryResult,
  QueryScope,
  ReplaceObjectsRequest,
  Snapshot,
  TextStyleChange,
} from './document.js';
import type { HostCapabilities } from './host.js';

/** UI 包提供的图标名。模块只引用名字，图标实现在 @aiq/ui 集中维护。 */
export type IconName =
  | 'stats'
  | 'select'
  | 'modules'
  | 'refresh'
  | 'search'
  | 'theme'
  | 'doc'
  | 'panel'
  | 'warn'
  | 'info'
  | 'close'
  | 'check'
  | 'text'
  | 'size'
  | 'swap'
  | 'mirror'
  | 'hand' | 'settings' | 'swapVertical'
  | 'undo';

export interface CommandSpec {
  /** 模块内唯一；全局命令 ID 为 `${moduleId}.${id}`。 */
  id: string;
  title: string;
  description?: string;
  icon?: IconName;
}

export interface PanelViewContribution {
  id: string;
  navTitle: string;
  icon: IconName;
  /** React 组件由模块包导出；面板按贡献挂载，不写死导航分支。 */
  viewKind: 'module-view';
}

/** 工具入口由功能包声明；侧栏、子工具与主页快捷入口共用同一份数据。 */
export interface ToolContribution {
  id: string;
  title: string;
  /** 模块内子工具标签；缺省用 title。首页与搜索始终用完整 title。 */
  tabTitle?: string;
  description: string;
  icon: IconName;
  viewId: string;
  section?: string;
  homeOrder?: number;
  queryPreset?: Pick<QueryRequest, 'target' | 'objectsFilter'>;
  selectResult?: boolean;
}

export interface ModuleManifest {
  id: string;
  title: string;
  description: string;
  version: string;
  contractVersion: typeof MODULE_CONTRACT_VERSION;
  icon: IconName;
  /** 激活必需的宿主能力；缺失时阻止启用并说明原因。 */
  requiredCapabilities: (keyof HostCapabilities)[];
  optionalCapabilities: (keyof HostCapabilities)[];
  commands: CommandSpec[];
  panelContributions: PanelViewContribution[];
  tools?: ToolContribution[];
  settingsVersion: number;
  /** 首版不支持模块间依赖：必须为空数组，非空将被显式拒绝。 */
  moduleDependencies: string[];
  defaultEnabled: boolean;
}

export interface ModuleImplementation {
  onActivate(ctx: ModuleContext): Promise<void>;
  onDeactivate(): Promise<void>;
  /** 处理本模块命令（commandId 为模块内 ID）。 */
  runCommand(commandId: string, ctx: ModuleContext): Promise<void>;
}

export interface ModuleBundle {
  manifest: ModuleManifest;
  implementation: ModuleImplementation;
}

export interface ModuleRegistrationResult {
  ok: boolean;
  moduleId: string;
  errors: CoreErrorInfo[];
}

// ---------------------------------------------------------------------------
// 面向模块的核心服务端口。core 包实现；模块只依赖这些接口。

export interface QueryServicePort {
  resolve(request: QueryRequest): Promise<QueryResult>;
  currentResult(): QueryResult | null;
  clearResult(): void;
}

export interface SnapshotServicePort {
  /** 确保范围内有可用快照；forceRefresh 强制重新采集（保守失效）。 */
  ensureSnapshot(scope: QueryScope, opts?: { forceRefresh?: boolean;readOnly?: boolean }): Promise<Snapshot>;
  currentSnapshot(): Snapshot | null;
  invalidate(): void;
}

export interface SelectionServicePort {
  /**
   * 选择当前结果中的对象。内部经统一调度，执行前复核引用；
   * 受限目标（隐藏/锁定）跳过并报告，不自动解锁或取消隐藏。
   */
  selectCurrentResult(): Promise<CommandResult>;
  /**
   * 选中文字片段结果所在的文本容器对象。
   * 语义是“定位整框”，不是片段选择；界面必须如实标注。
   */
  locateContainersOfCurrentResult(): Promise<CommandResult>;
}

/**
 * 写入服务：统一入口校验（文档会话、采集标记、能力），
 * 串行调度并在成功后失效快照缓存。引用应来自当前查询结果集。
 */
export interface WriteServicePort {
  applyTextStyleChanges(changes: TextStyleChange[]): Promise<CommandResult>;
  applyTransforms(transforms: ApplyTransformRequest['transforms']): Promise<CommandResult>;
  replaceObjects(
    request: Omit<ReplaceObjectsRequest, 'docSessionId' | 'expectedCollectionStamp'>,
  ): Promise<CommandResult>;
  applySymmetry(
    request: Omit<ApplySymmetryRequest, 'docSessionId' | 'expectedCollectionStamp'>,
  ): Promise<CommandResult>;
  /** 文字转曲（当前结果中的文本容器）。 */
  convertTextToOutlines(objectIds: string[]): Promise<CommandResult>;
  /** 导出文件队列（不依赖查询结果集；演示端导出 JSON 报告）。 */
  exportFiles(
    request: Omit<ExportFilesRequest, 'docSessionId'>,
  ): Promise<CommandResult>;
  /** 撤销上一次写入（若适配器支持）。 */
  undo(): Promise<CommandResult>;
  /** 当前结果携带的采集标记（供模块自检引用新鲜度）。 */
  currentStamp(): string | null;
}

export interface DocumentServicePort {
  /** 当前文档上下文；无文档时返回 null（不是错误）。 */
  getContext(): Promise<DocumentContext | null>;
  listDocuments(): Promise<DocumentContext[]>;
  setActiveDocument(sessionId: string): Promise<DocumentContext>;
}

/** 壳层范围条状态：模块读取当前查询范围，或响应范围变化。 */
export interface ScopeServicePort {
  current(): QueryScope;
  /** 应用新范围（触发范围变化事件，壳层同步 UI 与快照失效）。 */
  apply(scope: QueryScope): void;
  /** 范围变化监听；返回取消函数。 */
  onChange(listener: (scope: QueryScope) => void): () => void;
}

export interface LogPort {
  debug(message: string, detail?: Record<string, unknown>): void;
  info(message: string, detail?: Record<string, unknown>): void;
  warn(message: string, detail?: Record<string, unknown>): void;
  error(message: string, detail?: Record<string, unknown>): void;
}

export interface ModuleContext {
  moduleId: string;
  query: QueryServicePort;
  snapshots: SnapshotServicePort;
  selection: SelectionServicePort;
  documents: DocumentServicePort;
  scope: ScopeServicePort;
  writes: WriteServicePort;
  /** 统一调度入口；宿主动作串行执行。 */
  scheduler: SchedulerPort;
  log: LogPort;
}

export interface SchedulerPort {
  /** 串行执行宿主相关任务；支持超时与迟到响应丢弃。 */
  run<T>(label: string, task: () => Promise<T>, opts?: SchedulerTaskOptions): Promise<T>;
}

export interface SchedulerTaskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
    /** 兼容旧模块的字段；调度器不自动重试，宿主实际结束后由用户重新操作。 */
  retryOnTimeout?: boolean;
}
