import type { DemoDocumentSpec } from './types.js';

/**
 * 文档 A：画册封面（合成样例）。
 *
 * 覆盖必测元素：三层嵌套组、剪切组（含蒙版路径）、同框混合格式文字、
 * 串接故事跨两框、组合字符（U+0301）、两个画板 + 跨画板对象、
 * 隐藏/锁定对象、相同颜色多处使用、专色与视觉相近印刷色、未使用色板、
 * 同配方反向渐变、同名不同配方渐变、径向渐变、自由渐变（未支持）、
 * 符号实例与未知容器（未解析）。
 *
 * 人工预期数字见 expected.ts 与 expected-notes.md，均逐项手工核对，
 * 不由被测统计函数生成。
 */

const SOURCE_HEI = { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 12 };
const SOURCE_HEI_SZ36 = { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 36 };
const SOURCE_SONG = { fontFamily: '思源宋体', fontStyle: 'Regular', fontSizePt: 24 };

export const DEMO_DOCUMENT_A: DemoDocumentSpec = {
  sessionId: 'demo-doc-a',
  name: '画册封面（演示）.ai',
  unsavedChanges: true,
  artboards: [
    { id: 'ab-1', name: '封面', bounds: [0, 0, 595, 842] },
    { id: 'ab-2', name: '封底', bounds: [-595, 0, 0, 842] },
  ],
  layers: [
    {
      name: '底稿层',
      children: [
        {
          id: 'bg-rect',
          kind: 'path',
          name: '背景色块',
          bounds: [10, 10, 585, 830],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
        {
          id: 'group-main',
          kind: 'group',
          name: '主图形',
          bounds: [80, 120, 420, 500],
          children: [
            {
              id: 'group-inner',
              kind: 'group',
              name: '内部组',
              bounds: [90, 130, 300, 320],
              children: [
                {
                  id: 'star-1',
                  kind: 'path',
                  name: '五角星',
                  bounds: [100, 140, 180, 220],
                  fill: { gradient: 'gr-gold-a' },
                  stroke: { swatch: 'sw-gold-spot' },
                },
                {
                  id: 'star-2',
                  kind: 'path',
                  name: '五角星二',
                  bounds: [200, 140, 280, 220],
                  fill: { gradient: 'gr-gold-b' },
                  stroke: { none: true },
                },
                {
                  id: 'star-3',
                  kind: 'path',
                  name: '五角星三',
                  bounds: [150, 240, 230, 320],
                  fill: { gradient: 'gr-gold-c' },
                  stroke: { none: true },
                },
              ],
            },
            {
              id: 'clip-photo',
              kind: 'group',
              name: '照片剪切组',
              bounds: [90, 340, 410, 490],
              clipGroup: true,
              clipMaskChildId: 'clip-mask',
              children: [
                {
                  id: 'photo',
                  kind: 'image',
                  name: '产品图',
                  bounds: [90, 340, 410, 490],
                  fill: { none: true },
                  stroke: { none: true },
                },
                {
                  id: 'clip-mask',
                  kind: 'path',
                  name: '剪切形状',
                  bounds: [90, 340, 410, 490],
                  fill: { none: true },
                  stroke: { none: true },
                },
              ],
            },
            {
              id: 'dot-1',
              kind: 'path',
              name: '圆点',
              bounds: [350, 140, 390, 180],
              fill: { swatch: 'sw-brand-blue' },
              stroke: { tintOf: 'sw-gold-spot', tintPercent: 50 },
            },
            {
              id: 'ring-1',
              kind: 'path',
              name: '圆环',
              bounds: [330, 220, 410, 300],
              fill: { gradient: 'gr-radial-deco' },
              stroke: { none: true },
            },
            {
              id: 'free-1',
              kind: 'path',
              name: '自由渐变形',
              bounds: [330, 320, 410, 400],
              fill: { gradient: 'gr-freeform-x' },
              stroke: { none: true },
            },
          ],
        },
        {
          id: 'cross-board',
          kind: 'path',
          name: '跨画板装饰',
          bounds: [-120, 600, 700, 660],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
        {
          id: 'hidden-note',
          kind: 'text-point',
          name: '隐藏标注',
          bounds: [40, 780, 200, 795],
          hidden: true,
          storyId: 'story-4',
          text: [{ text: '隐藏标注', style: { ...SOURCE_HEI, fontSizePt: 9 } }],
        },
        {
          id: 'locked-bg',
          kind: 'path',
          name: '锁定底纹',
          bounds: [0, 0, 595, 842],
          locked: true,
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
      ],
    },
    {
      name: '文字层',
      children: [
        {
          id: 'title-mixed',
          kind: 'text-area',
          name: '主标题',
          bounds: [60, 520, 540, 600],
          storyId: 'story-1',
          text: [
            { text: '高效', style: { fontFamily: '思源黑体', fontStyle: 'Bold', fontSizePt: 36 } },
            { text: '工作台', style: SOURCE_HEI_SZ36 },
            { text: '演示', style: SOURCE_SONG },
          ],
        },
        {
          id: 'thread-1',
          kind: 'text-area',
          name: '串接框1',
          bounds: [60, 620, 300, 645],
          storyId: 'story-2',
          text: [{ text: '批量改稿', style: SOURCE_HEI }],
        },
        {
          id: 'thread-2',
          kind: 'text-area',
          name: '串接框2',
          bounds: [320, 620, 540, 645],
          storyId: 'story-2',
          text: [{ text: '不再反复', style: SOURCE_HEI }],
        },
        {
          id: 'unicode-sample',
          kind: 'text-point',
          name: '组合字示例',
          bounds: [60, 660, 300, 675],
          storyId: 'story-3',
          // “cafe” + U+0301 组合尖音符 + 空格 + “台”：
          // UTF-16 宿主单位 8，视觉字素 6（c a f é 空格 台）。
          text: [{ text: 'cafe\u0301 台', style: { ...SOURCE_HEI, fontSizePt: 10 } }],
        },
        {
          id: 'symbol-badge',
          kind: 'symbol-instance',
          name: '徽章',
          bounds: [480, 40, 560, 120],
          unresolved: '符号实例内容未解析',
        },
        {
          id: 'weird-container',
          kind: 'unknown',
          name: '特殊容器',
          bounds: [-560, 700, -300, 820],
          unresolved: '未知容器类型（演示模拟透明度蒙版）',
        },
      ],
    },
  ],
  swatches: [
    { id: 'sw-brand-blue', name: '品牌蓝', kind: 'process-cmyk', values: [100, 80, 0, 0] },
    { id: 'sw-gold-spot', name: '烫金专色', kind: 'spot', values: [0, 20, 100, 20] },
    // 与烫金专色数值相同的印刷色：视觉相近但身份不同，统计不得合并（C02）。
    { id: 'sw-warm-gold', name: '暖金 CMYK', kind: 'process-cmyk', values: [0, 20, 100, 20] },
    // 渐变配方内部使用的色板；无对象直接使用。
    { id: 'sw-brand-yellow', name: '品牌黄', kind: 'process-cmyk', values: [0, 16, 100, 0] },
    // 未使用库存（C03）。
    { id: 'sw-unused-red', name: '备用红', kind: 'process-cmyk', values: [0, 100, 100, 0] },
    { id: 'sw-noise-pattern', name: '噪点图案', kind: 'pattern' },
  ],
  gradients: [
    { id: 'gr-gold-a', name: '金渐变', kind: 'linear', stops: [
      { offset: 0, swatchId: 'sw-gold-spot' },
      { offset: 100, swatchId: 'sw-brand-yellow' },
    ] },
    // 反向同配方：与 gr-gold-a 停靠序列语义等价（G01）。
    { id: 'gr-gold-b', name: '金渐变-反向', kind: 'linear', stops: [
      { offset: 0, swatchId: 'sw-brand-yellow' },
      { offset: 100, swatchId: 'sw-gold-spot' },
    ] },
    // 与 gr-gold-a 同名但中点不同：配方不同，不得按名称合并（G02）。
    { id: 'gr-gold-c', name: '金渐变', kind: 'linear', stops: [
      { offset: 0, swatchId: 'sw-gold-spot', midpoint: 25 },
      { offset: 100, swatchId: 'sw-brand-yellow' },
    ] },
    { id: 'gr-radial-deco', name: '径向装饰', kind: 'radial', stops: [
      { offset: 0, swatchId: 'sw-brand-blue' },
      { offset: 100, swatchId: 'sw-brand-yellow' },
    ] },
    // 自由渐变：未支持类型（G02 的未支持分支）。
    { id: 'gr-freeform-x', name: '自由渐变X', kind: 'freeform', stops: [
      { offset: 0, swatchId: 'sw-gold-spot' },
      { offset: 100, swatchId: 'sw-unused-red' },
    ] },
  ],
  initialSelectionIds: [],
};

/**
 * 文档 B：Logo 变体（演示第二文档）。
 * 含与文档 A 同名的 “五角星”（A06：引用按文档隔离）。
 */
export const DEMO_DOCUMENT_B: DemoDocumentSpec = {
  sessionId: 'demo-doc-b',
  name: 'Logo 变体（演示）.ai',
  unsavedChanges: false,
  artboards: [{ id: 'ab-b1', name: '画板 1', bounds: [0, 0, 400, 400] }],
  layers: [
    {
      name: '图层 1',
      children: [
        {
          id: 'star-1',
          kind: 'path',
          name: '五角星',
          bounds: [50, 50, 200, 200],
          fill: { rgb: [0, 102, 204] },
          stroke: { none: true },
        },
        {
          id: 'brand-block',
          kind: 'path',
          name: '品牌蓝块',
          bounds: [50, 220, 350, 350],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
      ],
    },
  ],
  swatches: [{ id: 'sw-brand-blue', name: '品牌蓝', kind: 'process-cmyk', values: [100, 80, 0, 0] }],
  gradients: [],
  initialSelectionIds: [],
};

/**
 * 文档 C：对称演示（独立文档，不影响文档 A 的人工预期表）。
 * 三个凸多边形：跨轴矩形、跨轴三角形、轴右外侧小矩形。
 * 对称轴样例：x=0（画板垂直中线）。
 */
export const DEMO_DOCUMENT_C: DemoDocumentSpec = {
  sessionId: 'demo-doc-c',
  name: '对称演示（演示）.ai',
  unsavedChanges: false,
  artboards: [{ id: 'ab-c1', name: '对称画板', bounds: [-200, 0, 200, 400] }],
  layers: [
    {
      name: '对称层',
      children: [
        {
          id: 'sym-flag',
          kind: 'path',
          name: '跨轴旗形',
          bounds: [-60, 40, 80, 140],
          points: [
            [-60, 40],
            [80, 40],
            [80, 140],
            [-60, 140],
          ],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
        {
          id: 'sym-tri',
          kind: 'path',
          name: '跨轴三角',
          bounds: [-100, 200, 100, 320],
          points: [
            [-100, 200],
            [100, 200],
            [0, 320],
          ],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
        {
          id: 'sym-right',
          kind: 'path',
          name: '右侧小形',
          bounds: [30, 340, 120, 395],
          points: [
            [30, 340],
            [120, 340],
            [120, 395],
            [30, 395],
          ],
          fill: { swatch: 'sw-brand-blue' },
          stroke: { none: true },
        },
      ],
    },
  ],
  swatches: [{ id: 'sw-brand-blue', name: '品牌蓝', kind: 'process-cmyk', values: [100, 80, 0, 0] }],
  gradients: [],
  initialSelectionIds: [],
};

export const DEMO_DOCUMENTS: DemoDocumentSpec[] = [DEMO_DOCUMENT_A, DEMO_DOCUMENT_B, DEMO_DOCUMENT_C];
