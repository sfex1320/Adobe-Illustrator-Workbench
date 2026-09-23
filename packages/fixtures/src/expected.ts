/**
 * 文档 A（画册封面）人工核对预期表。
 *
 * 以下数字由人工按 documents.ts 的结构逐项清点写死，
 * 供统计与查询测试断言使用；严禁用被测函数的输出回填。
 * 每个数字的推导过程见同目录 expected-notes.md。
 */

export const EXPECTED_A = {
  /** 对象树节点总数（含组、蒙版路径、符号、未知容器）。 */
  totalNodes: 21,
  /** 组节点数（group-main、group-inner、clip-photo）。 */
  groupNodes: 3,
  /** 非组节点数。 */
  leafNodes: 18,

  query: {
    /** 默认范围（文档、穿透组与剪切组、不含蒙版路径、不含隐藏锁定）命中对象数。 */
    defaultDocumentHit: 15,
    /** 命中但受限（隐藏 1 + 锁定 1）。 */
    defaultRestricted: 2,
    /** 含蒙版路径开关后命中数（+clip-mask）。 */
    withMaskPathsHit: 16,
    /** 不穿透剪切组时：clip-photo 整组为目标（photo 不再单独出现）。 */
    noPierceClipHit: 15,
    /** 不穿透普通组时：group-main 整组为目标。 */
    noPierceGroupHit: 9,
    /** 画板“封面”(ab-1) 范围命中（weird-container 只在封底）。 */
    artboard1Hit: 14,
    /** 画板“封底”(ab-2) 范围命中（cross-board + weird-container）。 */
    artboard2Hit: 2,
    /** 空选区查询命中 0。 */
    emptySelectionHit: 0,
    /** 演示选区 = [star-1, dot-1] 时 selection 范围命中。 */
    selectionHit: 2,
  },

  text: {
    /** 快照全量片段数（含隐藏对象）。 */
    allSpans: 7,
    /** 默认查询范围（不含隐藏）片段数。 */
    visibleSpans: 6,
    /** 文本容器数。 */
    containers: 5,
    /** 故事数（story-1..4；thread-1/2 同属 story-2）。 */
    stories: 4,
    /** 字体家族数。 */
    families: 2,
    /**（家族,款式）组合数。 */
    familyStyles: 3,
    /** 字号(pt 原值) → 片段数。 */
    fontSizeHistogram: { '36': 2, '24': 1, '12': 2, '10': 1, '9': 1 } as Record<string, number>,
    /** 字符总数（故事去重口径，宿主 UTF-16 单位）。S1=7，S2=8，S3=7（组合符占 1 单位），S4=4。 */
    hostUnitChars: 26,
    /** 字符总数（故事去重口径，字素）。S3 为 6（c a f é 空格 台）。 */
    graphemeChars: 25,
    /** 组合字片段：宿主单位长度 7 与字素数 6 —— 两个口径在此分叉。 */
    unicodeSpan: { hostUnits: 7, graphemes: 6 },
    /** “思源黑体 Regular 12pt” 只读匹配命中片段数（跨框非连续，T04）。 */
    heiRegular12Spans: 2,
    /** 字号容差 35±2pt 命中片段数（36pt 两段）。 */
    sizeTolerance35: 2,
  },

  color: {
    /** 对象直接使用的实色种类（身份去重）：品牌蓝、烫金专色、烫金专色 50%。 */
    usedSolidKinds: 3,
    /** 品牌蓝使用位置数（C01：种类 1、位置 4）。 */
    brandBlueUses: 4,
    /** 库存色板总数。 */
    swatchCount: 6,
    /** 未使用色板数（暖金 CMYK、品牌黄、备用红、噪点图案）。 */
    unusedSwatches: 4,
    /** 视觉相近但身份不同的两类（烫金专色 vs 暖金 CMYK，C02）均独立存在。 */
    spotVsProcessSeparated: true,
    /** 对象使用的渐变种类（含未支持自由渐变）。 */
    usedGradientKinds: 5,
  },

  gradient: {
    /** 渐变定义总数。 */
    definitions: 5,
    /** 配方去重后：linear(默认中点)+其反向合并=1，linear(mid25)=1，radial=1。 */
    dedupedRecipes: 3,
    /** 使用实例总数（4 个对象 fill）。 */
    instances: 4,
    /** 未支持类型（自由渐变）数。 */
    unsupported: 1,
  },

  coverage: {
    /** 内容未解析对象数（符号实例 + 未知容器，A05）。 */
    skippedObjects: 2,
  },

  /** 文档 B：与文档 A 存在同名对象“五角星”（A06 引用按文档隔离）。 */
  docB: {
    nodes: 2,
    sameNameObjectInBoth: 'star-1',
  },
} as const;
