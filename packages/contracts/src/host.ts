import { type CoreErrorInfo } from './errors.js';

/** 适配器形态：演示数据或 CEP 宿主桥接。 */
export type HostAdapterKind = 'demo' | 'cep';

/**
 * 单项能力的声明。supported 表示适配器实现了这条路径；
 * verifiedOnHost 表示已在真实 Illustrator 上验证过。
 * 演示适配器 supported=true 但 verifiedOnHost=false。
 */
export interface CapabilityClaim {
  supported: boolean;
  verifiedOnHost: boolean;
  note?: string;
}

export interface HostCapabilities {
  editorTools?: CapabilityClaim;
  connect: CapabilityClaim;
  readDocumentContext: CapabilityClaim;
  readArtboards: CapabilityClaim;
  collectSnapshot: CapabilityClaim;
  selectObjects: CapabilityClaim;
  /** 局部文字格式取样（区别于整框属性）。 */
  sampleTextSpanFormats: CapabilityClaim;
  /** 可靠的文档变更事件。未验证时应用显式刷新与执行前复核。 */
  documentChangeEvents: CapabilityClaim;
  /** 跨操作稳定的对象持久 ID。不支持时引用仅在本快照内有效。 */
  persistentObjectId: CapabilityClaim;
  /** 读取路径点集（entirePath）。对称等几何操作的前提。 */
  readPathPoints: CapabilityClaim;
  /** 写入文字片段样式（字体家族/款式/字号）。 */
  writeTextStyles: CapabilityClaim;
  /** 对象几何变换（缩放/位移，用于统一尺寸）。 */
  transformObjects: CapabilityClaim;
  /** 复制来源对象替换目标（A→B 替换）。 */
  replaceObjects: CapabilityClaim;
  /** 写回路径点集（对称切分/镜像重建）。 */
  writePathPoints: CapabilityClaim;
  /** 文字转曲（createOutlines）。演示环境以字符边界矩形近似并明确标注。 */
  convertTextToOutlines: CapabilityClaim;
  /** 导出文件（PNG/JPEG/PDF）。演示环境导出 JSON 报告并明确标注。 */
  exportFiles: CapabilityClaim;
  /** 撤销上一次写入（宿主 undo 或演示撤销栈）。 */
  undoWrite: CapabilityClaim;
}

export type HostConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface HostInfo {
  adapterKind: HostAdapterKind;
  /** 展示名，如“演示适配器（合成样例）”或“Illustrator 30.0（CEP）”。 */
  displayName: string;
  connection: HostConnectionState;
  /** 宿主应用名与版本；演示适配器为空。 */
  hostName?: string;
  hostVersion?: string;
  capabilities: HostCapabilities;
  /** 已知限制的人类可读列表。 */
  limitations: string[];
  lastError?: CoreErrorInfo;
}
