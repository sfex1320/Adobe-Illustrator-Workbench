import type { CoreErrorInfo } from './errors.js';
import type {
  ApplySymmetryRequest,
  ApplyTextStyleRequest,
  ApplyTransformRequest,
  CommandResult,
  ConvertOutlinesRequest,
  DocumentContext,
  ExportFilesRequest,
  QueryScope,
  ReplaceObjectsRequest,
  SelectRequest,
  Snapshot,
} from './document.js';
import type { HostInfo } from './host.js';
import type { EditorRequest, EditorResult, EditorState, ExportProgress } from './editor.js';

/**
 * 宿主适配器接口。实现方必须保证：
 * - 读操作不修改文档；
 * - 未连接与无文档是两种不同状态；
 * - 失败保留错误，不静默回退到演示数据；
 * - 原始宿主对象先转为可序列化数据再返回。
 */
export interface HostAdapter {
  readonly kind: 'demo' | 'cep';
  /** Explicit navigation only; no artwork snapshot, selection read or document write. */
  selectNativeTool?(tool: 'selection'|'text'|'artboard', docSessionId?:string):Promise<{tool:string}>;
  getEditorRevision?(): Promise<string>;
  readEditorState?(profile?: 'document' | 'selection' | 'properties'): Promise<EditorState | null>;
  waitForHostIdle?(): Promise<void>;
  releaseEditorState?(): Promise<void>;
  editDocument?(request: EditorRequest): Promise<EditorResult>;
  /** Only a locally owned, timed-out preparation may recover its sealed result. Never replays host work. */
  recoverRasterPreparation?(request: EditorRequest): Promise<EditorResult>;
  /** Independent worker runs after the shared Illustrator lane is released. */
  finishRasterExport?(prepared: EditorResult): Promise<EditorResult>;
  chooseFolder?(initial?:string):Promise<string|null>;
  supportsExportProgress?(): boolean;
  readExportProgress?(jobId: string): Promise<ExportProgress | null>;
  cancelExport?(jobId: string): Promise<void>;
  getHostInfo(): Promise<HostInfo>;
  /** 连接检查。失败返回 disconnected 状态而不是抛错；详细错误放 lastError。 */
  connect(): Promise<HostInfo>;
  getDocumentContext(): Promise<DocumentContext>;
  /** 可用文档列表。仅演示适配器支持切换；CEP 首版返回活动文档并在能力中说明限制。 */
  listDocuments(): Promise<DocumentContext[]>;
  setActiveDocument(sessionId: string): Promise<DocumentContext>;
  /** 按范围只读采集快照。 */
  collectSnapshot(scope: QueryScope, options?: {readOnly?:boolean}): Promise<Snapshot>;
  /** 选择固定目标。执行前校验文档会话与采集标记。 */
  selectObjects(request: SelectRequest): Promise<CommandResult>;

  // ---- 写入操作（可选能力；不支持时方法缺省，能力声明为 supported=false）----
  /** 逐片段写文字样式。成功后文档内容变化，旧引用失效。 */
  applyTextStyles?(request: ApplyTextStyleRequest): Promise<CommandResult>;
  /** 对象几何变换（统一尺寸等）。 */
  applyTransforms?(request: ApplyTransformRequest): Promise<CommandResult>;
  /** 复制来源对象替换目标。 */
  replaceObjects?(request: ReplaceObjectsRequest): Promise<CommandResult>;
  /** 写回路径点集（对称切分/镜像结果）。 */
  applySymmetry?(request: ApplySymmetryRequest): Promise<CommandResult>;
  /** 文字转曲（文本容器 → 轮廓路径）。 */
  convertTextToOutlines?(request: ConvertOutlinesRequest): Promise<CommandResult>;
  /** 导出文件队列。 */
  exportFiles?(request: ExportFilesRequest): Promise<CommandResult>;
  /** 撤销上一次写入。 */
  undoWrite?(): Promise<CommandResult>;
}

export interface HostEvent {
  type: 'documents-changed' | 'connection-changed';
  error?: CoreErrorInfo;
}
