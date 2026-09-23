import type { Bounds, ObjectKind, TextStyle } from '@aiq/contracts';

/**
 * 演示文档的结构化源数据。演示适配器（@aiq/host-adapter 的 DemoHostAdapter）
 * 将其编译为 Snapshot；本包只含数据与类型，不含运行逻辑。
 */

export interface DemoTextRun {
  text: string;
  style: TextStyle;
}

export type DemoColorSpec =
  | { swatch: string }
  | { gradient: string }
  | { tintOf: string; tintPercent: number }
  | { rgb: [number, number, number] }
  | { none: true }
  | { unresolved: string };

export interface DemoNodeSpec {
  id: string;
  kind: ObjectKind;
  name?: string;
  bounds: Bounds;
  hidden?: boolean;
  locked?: boolean;
  /** 组形态标记：剪切组。 */
  clipGroup?: boolean;
  /** 剪切组中承担蒙版角色的子节点 ID。 */
  clipMaskChildId?: string;
  children?: DemoNodeSpec[];
  /** 文本容器：内容片段序列。 */
  text?: DemoTextRun[];
  /** 文本故事 ID；相同 storyId 的容器视为串接。 */
  storyId?: string;
  /** 符号实例、未知容器等未解析项的原因。 */
  unresolved?: string;
  fill?: DemoColorSpec;
  stroke?: DemoColorSpec;
  /**
   * 多边形点集（path/compound-path 的 entirePath 等价物）。
   * 对称等几何操作的前提；建议凸多边形（裁剪算法对凹形产生退化桥接边）。
   */
  points?: Array<[number, number]>;
}

export interface DemoLayerSpec {
  name: string;
  children: DemoNodeSpec[];
}

export interface DemoSwatchSpec {
  id: string;
  name: string;
  kind: 'process-cmyk' | 'rgb' | 'gray' | 'spot' | 'pattern';
  /** CMYK 4 元 / RGB 3 元。专色可带近似值但身份独立。 */
  values?: number[];
}

export interface DemoGradientStopSpec {
  offset: number;
  swatchId: string;
  midpoint?: number;
}

export interface DemoGradientSpec {
  id: string;
  name: string;
  kind: 'linear' | 'radial' | 'freeform';
  stops: DemoGradientStopSpec[];
}

export interface DemoArtboardSpec {
  id: string;
  name: string;
  bounds: Bounds;
}

export interface DemoDocumentSpec {
  sessionId: string;
  name: string;
  unsavedChanges: boolean;
  artboards: DemoArtboardSpec[];
  layers: DemoLayerSpec[];
  swatches: DemoSwatchSpec[];
  gradients: DemoGradientSpec[];
  /** 初始选区对象 ID。默认空（空选区查询是必测案例）。 */
  initialSelectionIds: string[];
}
