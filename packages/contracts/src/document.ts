/** 文档、对象、文字片段、快照、查询与命令结果的可序列化契约。 */

import type { CoreErrorInfo } from './errors.js';

// ---------------------------------------------------------------------------
// 基础

/** [left, top, right, bottom]，pt，核心坐标系 y 向下；宿主适配器负责坐标转换。 */
export type Bounds = [number, number, number, number];

export interface ArtboardRef {
  id: string;
  name: string;
  bounds: Bounds;
}

export interface DocumentContext {
  /** 文档会话 ID。未保存文档也必须隔离；不能只用名称或路径。 */
  sessionId: string;
  name: string;
  isOpen: boolean;
  /** 状态标记，如未保存修改。 */
  flags: { unsavedChanges: boolean; readonly?: boolean };
  activeArtboardId?: string;
}

// ---------------------------------------------------------------------------
// 对象

export type ObjectKind =
  | 'path'
  | 'compound-path'
  | 'group'
  | 'text-point'
  | 'text-area'
  | 'text-path'
  | 'image'
  | 'symbol-instance'
  | 'unknown';

export const OBJECT_KIND_LABELS: Record<ObjectKind, string> = {
  path: '路径',
  'compound-path': '复合路径',
  group: '组',
  'text-point': '点文字',
  'text-area': '区域文字',
  'text-path': '路径文字',
  image: '图片',
  'symbol-instance': '符号实例',
  unknown: '未知类型',
};

export interface ObjectRef {
  docSessionId: string;
  /** 适配器身份空间内的对象标识。演示为稳定字符串；CEP 映射快照内原生引用。 */
  objectId: string;
  kind: ObjectKind;
  name?: string;
  /** 层级路径：图层名 → 各级父组名 → 对象名（或类型标签）。 */
  hierarchicalPath: string[];
  parentId?: string;
  bounds?: Bounds;
  /** 所属画板。跨画板对象多于一个（这是文档总计去重口径的依据）。 */
  artboardIds: string[];
  hidden: boolean;
  locked: boolean;
  flags: {
    /** 本身是剪切组。 */
    clipGroup?: boolean;
    /** 本身是某剪切组的蒙版路径，指向该组 objectId。 */
    clipPathFor?: string;
    /** 位于剪切组内部。 */
    insideClipGroup?: boolean;
    /** 位于普通组内部（穿透查询时用于还原父子关系展示）。 */
    insideGroup?: boolean;
    /** 符号 / 未知容器实例，内容未解析。 */
    unresolved?: boolean;
    unresolvedReason?: string;
  };
  fill?: ColorUse;
  stroke?: ColorUse;
  /** 文字连续颜色片段，独立于字体统计。 */
  textPaints?: ColorUse[];
  /**
   * 路径点集（entirePath 等价物，仅 path / compound-path 且点数在采集上限内）。
   * 对称等几何操作的前提；超出上限或类型不支持时缺省并在限制中说明。
   */
  pathPoints?: Array<[number, number]>;
}

// ---------------------------------------------------------------------------
// 颜色与渐变

export type ColorKind =
  | 'process-cmyk'
  | 'rgb'
  | 'gray'
  | 'spot'
  | 'spot-tint'
  | 'gradient'
  | 'pattern'
  | 'none'
  | 'unknown';

export interface ColorDef {
  colorId: string;
  kind: ColorKind;
  /** 色板名；专色身份包含名称，视觉相近不合并。 */
  name?: string;
  /** CMYK 为 4 元素、RGB 为 3 元素、灰度为 1 元素；未知时缺省。 */
  values?: number[];
  /** 渐变引用（kind='gradient' 时）。 */
  gradientId?: string;
  unresolvedReason?: string;
  previewRgb?: number[];
}

export interface ColorUse {
  role: 'fill' | 'stroke';
  color: ColorDef;
}

/** 色板库存条目（含未使用）。usedObjectIds 为空即未使用。 */
export interface SwatchEntry {
  colorId: string;
  name?: string;
  kind: ColorKind;
  values?: number[];
  usedObjectIds: string[];
  registeredAsSwatch: true;
}

export type GradientKind = 'linear' | 'radial' | 'unknown';

export interface GradientStop {
  color?: ColorDef;
  offset: number;
  colorId: string;
  /** 0-100 中点位置；缺省视为 50。 */
  midpoint?: number;
  /** 色标不透明度 0-100；缺省视为 100。 */
  opacity?: number;
}

export interface GradientDef {
  gradientId: string;
  name?: string;
  kind: GradientKind;
  stops: GradientStop[];
  /** 自由渐变等未支持类型。 */
  unresolvedReason?: string;
}

// ---------------------------------------------------------------------------
// 文字片段

export interface TextStyle {
  fontFamily: string;
  /** 款式：Regular / Bold / Italic 等。 */
  fontStyle: string;
  /** pt 原值。 */
  fontSizePt: number;
  /** 无法解析的属性名单，不填默认值。 */
  unknownFields?: string[];
}

export interface TextSpanRef {
  docSessionId: string;
  spanId: string;
  storyId: string;
  /** 所在文本容器对象。 */
  containerObjectId: string;
  /** 宿主索引单位下的起止偏移，含 start 不含 end。 */
  start: number;
  end: number;
  /** 偏移单位声明。演示实现为 UTF-16 code unit；真实宿主以适配器实测为准。 */
  offsetUnit: 'host';
  /** 片段文本。调试日志不得输出完整内容。 */
  text: string;
  style: TextStyle;
  /** 口径计数：宿主单位字符数与字素数分开。 */
  hostUnitLength: number;
  graphemeCount: number;
}

/** 串接故事信息，用于跨框去重。 */
export interface StoryInfo {
  storyId: string;
  containerObjectIds: string[];
}

// ---------------------------------------------------------------------------
// 快照

export interface SkippedEntry {
  objectId: string;
  reason: string;
  kind?: ObjectKind;
}

export interface CoverageInfo {
  supportedObjectCount: number;
  skippedObjectCount: number;
  textContainerCount: number;
  textSpanCount: number;
  /** 无法解析的类型汇总说明。 */
  notes: string[];
}

export interface Snapshot {
  docSessionId: string;
  docName: string;
  /** 采集标记。同一文档每次采集单调变化，用于引用与缓存失效判断。 */
  collectionStamp: string;
  collectedAtIso: string;
  scope: QueryScope;
  artboards: ArtboardRef[];
  objects: ObjectRef[];
  textSpans: TextSpanRef[];
  stories: StoryInfo[];
  swatches: SwatchEntry[];
  gradients: GradientDef[];
  skipped: SkippedEntry[];
  coverage: CoverageInfo;
  /** 采集时的选区（范围 kind='selection' 时按此过滤）。 */
  selectionObjectIds: string[];
}

// ---------------------------------------------------------------------------
// 查询

export type QueryScopeKind = 'document' | 'artboard' | 'layer' | 'selection';

export interface QueryScope {
  kind: QueryScopeKind;
  artboardId?: string;
  layerName?: string;
  /** 穿透普通组寻找实际子对象。关闭时组本身作为整体目标。 */
  pierceGroups: boolean;
  /** 穿透剪切组查询其内容（不释放蒙版）。 */
  pierceClipGroups: boolean;
  /** 蒙版路径本身作为独立目标。 */
  includeMaskPaths: boolean;
  includeHidden: boolean;
  includeLocked: boolean;
}

export const DEFAULT_QUERY_SCOPE: QueryScope = {
  kind: 'document',
  pierceGroups: true,
  pierceClipGroups: true,
  includeMaskPaths: false,
  includeHidden: false,
  includeLocked: false,
};

export interface TextStyleQuery {
  fontFamily?: string;
  fontStyle?: string;
  fontSizePt?: number;
  /** pt 容差，仅用于查询匹配；统计展示始终用原值。 */
  fontSizeTolerancePt?: number;
}

export interface ObjectsFilter {
  kinds?: ObjectKind[];
  nameIncludes?: string;
  textStyle?: TextStyleQuery;
  usesColorId?: string;
  colorRole?: 'fill' | 'stroke' | 'any';
  usesGradientId?: string;
}

export interface QueryRequest {
  scope: QueryScope;
  target: 'objects' | 'text-spans';
  objectsFilter?: ObjectsFilter;
}

export interface RestrictedTarget {
  objectId: string;
  label: string;
  reason: string;
}

export interface QueryResult {
  requestId: string;
  createdAtIso: string;
  request: QueryRequest;
  docSessionId: string;
  /** 结果基于哪个快照的采集标记。 */
  collectionStamp: string;
  objects: ObjectRef[];
  textSpans: TextSpanRef[];
  /** 文档总计去重后的目标数量（跨画板对象计一次）。 */
  dedupedTargetCount: number;
  /** 命中但受限（隐藏 / 锁定且未开启包含开关）的目标。 */
  restricted: RestrictedTarget[];
  coverage: CoverageInfo;
}

// ---------------------------------------------------------------------------
// 选择命令

export interface SelectRequest {
  focus?: boolean;
  docSessionId: string;
  objectIds: string[];
  /** 执行前校验：基于该采集标记的引用才执行。 */
  expectedCollectionStamp?: string;
}

export interface SkippedTarget {
  objectId: string;
  reason: string;
}

export interface CommandResult {
  status: 'completed' | 'partial' | 'failed' | 'unsupported';
  selectedObjectIds: string[];
  skipped: SkippedTarget[];
  /** 声明的副作用类型：'selection'（选择）、'text-style-write'（文字样式写入）、'transform'（几何变换）、'replace'（复制与删除）、'symmetry'（路径点改写）。 */
  sideEffects: string[];
  error?: CoreErrorInfo;
  /** 写入类命令：结果可通过一次撤销恢复（宿主 undo 分组或演示撤销栈）。 */
  undoable?: boolean;
  /** 导出类命令：逐任务结果。 */
  exportResults?: ExportTaskResult[];
}

// ---------------------------------------------------------------------------
// 写入请求（演示端真实生效；CEP 端按契约实现并标注实机验证状态）

/** 单个文字片段的样式改写。未给出的字段保持原值。 */
export interface TextStyleChange {
  spanId: string;
  /** 片段范围（宿主偏移单位），来自查询结果；供宿主端执行前定位与复核。 */
  start?: number;
  end?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontSizePt?: number;
}

export interface ApplyTextStyleRequest {
  docSessionId: string;
  expectedCollectionStamp?: string;
  changes: TextStyleChange[];
}

/** 对象几何变换：把对象缩放/移动到目标边界。 */
export interface ObjectTransform {
  objectId: string;
  targetBounds: Bounds;
  /** true 时在目标边界内保持宽高比（等比）；false 时拉伸到精确边界。 */
  keepProportions: boolean;
}

export interface ApplyTransformRequest {
  docSessionId: string;
  expectedCollectionStamp?: string;
  transforms: ObjectTransform[];
}

export interface ReplaceObjectsRequest {
  docSessionId: string;
  expectedCollectionStamp?: string;
  /** 来源对象 B：被复制的内容。 */
  sourceObjectId: string;
  /** 目标对象 A 列表：每个 A 的位置与尺寸作为放置依据。 */
  targetObjectIds: string[];
  /** copy-in-place：复制 B 到每个 A 的边界内（等比匹配）；swap：B 与首个 A 交换位置。 */
  mode: 'copy-in-place' | 'swap';
  /** 是否删除被替换的 A。 */
  removeTargets: boolean;
}

/** 对称轴：垂直线 x=position（left/right 侧）或水平线 y=position（top/bottom 侧）。 */
export interface SymmetrySpec {
  axis: 'x' | 'y';
  position: number;
  keepSide: 'left' | 'right' | 'top' | 'bottom';
  /** 保留半边后按轴镜像重建另一侧（副本），得到轴对称结果。 */
  mirrorRebuild: boolean;
}

/** 单个对象的对称写回项：points/rings 均为空表示该目标整体位于舍弃侧、应删除。 */
export interface ApplySymmetryItem {
  objectId: string;
  /** 单环写回（凸结果）；多环结果改用 rings。 */
  points?: Array<[number, number]>;
  /** 多环写回（凹形严格切分输出多个路径段）：首环替换原对象，其余环创建兄弟路径。 */
  rings?: Array<Array<[number, number]>>;
}

export interface ApplySymmetryRequest {
  docSessionId: string;
  expectedCollectionStamp?: string;
  /** 记录用的对称参数（几何计算在面板端完成后以点集形式写回）。 */
  spec: SymmetrySpec;
  items: ApplySymmetryItem[];
  /**
   * 实时会话帧：参数连续变化时的中间写回。
   * 宿主端在下一帧前撤销上一帧（保持一步撤销可还原整个实时会话）。
   */
  live?: boolean;
}

// ---------------------------------------------------------------------------
// 转曲与导出

export interface ConvertOutlinesRequest {
  docSessionId: string;
  expectedCollectionStamp?: string;
  /** 文本容器对象列表。 */
  objectIds: string[];
}

export type ExportFormat = 'png' | 'jpeg' | 'pdf' | 'report';

export interface ExportTaskSpec {
  name: string;
  format: ExportFormat;
  /** 栅格导出倍率（100 = 1x）。 */
  scalePct: number;
}

export interface ExportTaskResult {
  name: string;
  status: 'done' | 'failed' | 'unsupported';
  /** 完成说明（演示报告文件名或宿主端输出说明）；失败原因。 */
  message?: string;
}

export interface ExportFilesRequest {
  docSessionId: string;
  tasks: ExportTaskSpec[];
  /** 导出目录提示（宿主端弹出选择对话框时作为初始位置；演示端忽略）。 */
  targetFolderHint?: string;
}
