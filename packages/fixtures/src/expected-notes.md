# 演示样例人工预期表（文档 A：画册封面）

本表逐项人工清点 `documents.ts` 中 `DEMO_DOCUMENT_A` 的结构得出，
`expected.ts` 中的常量与此一致。测试断言直接引用这些数字；
**不允许**用被测统计/查询函数的输出回填本表。

## 对象树（21 节点）

底稿层：
| # | id | 类型 | 说明 |
|---|---|---|---|
| 1 | bg-rect | path | 品牌蓝填充 |
| 2 | group-main | group | 普通组（第 1 层） |
| 3 | group-inner | group | 嵌套组（第 2 层） |
| 4 | star-1 | path | 渐变 gr-gold-a + 烫金专色描边 |
| 5 | star-2 | path | 渐变 gr-gold-b（反向） |
| 6 | star-3 | path | 渐变 gr-gold-c（同名不同配方） |
| 7 | clip-photo | group | 剪切组 |
| 8 | photo | image | 剪切组内容 |
| 9 | clip-mask | path | 剪切组蒙版路径 |
| 10 | dot-1 | path | 品牌蓝填充 + 专色 50% 淡色描边 |
| 11 | ring-1 | path | 径向渐变 |
| 12 | free-1 | path | 自由渐变（未支持） |
| 13 | cross-board | path | 横跨封面/封底两画板 |
| 14 | hidden-note | text-point | 隐藏 |
| 15 | locked-bg | path | 锁定，品牌蓝填充 |

文字层：
| # | id | 类型 | 说明 |
|---|---|---|---|
| 16 | title-mixed | text-area | 同框 3 种格式（T01） |
| 17 | thread-1 | text-area | story-2 串接框 1 |
| 18 | thread-2 | text-area | story-2 串接框 2（T02） |
| 19 | unicode-sample | text-point | 组合字符（T05） |
| 20 | symbol-badge | symbol-instance | 未解析（A05） |
| 21 | weird-container | unknown | 未解析（A05） |

组 3 个、非组 18 个。

## 查询口径（默认开关：穿透组、穿透剪切组、不含蒙版路径、不含隐藏锁定）

- 全文档命中 15：bg-rect、star-1、star-2、star-3、photo、dot-1、ring-1、free-1、cross-board、title-mixed、thread-1、thread-2、unicode-sample、symbol-badge、weird-container。组本身不出现（穿透）；clip-mask 不出现（蒙版路径开关关）；hidden-note、locked-bg 进受限列表（2 项）。
- 开“包含蒙版路径”后 16（+clip-mask）。
- 关“穿透剪切组”后 15：photo/clip-mask 消失，clip-photo 整组计 1。
- 关“穿透普通组”后 9：bg-rect、group-main（整组）、cross-board、title-mixed、thread-1、thread-2、unicode-sample、symbol-badge、weird-container。
- 画板“封面”：15 中去掉只在封底的 weird-container → 14。
- 画板“封底”：cross-board + weird-container → 2。
- cross-board 在文档总计只计 1 次（去重口径）。
- 空选区 → 0；演示选区 [star-1, dot-1] → 2。

## 文字口径

7 个片段（全量）：高效(Bold36)、工作台(黑体 Regular36)、演示(宋体 Regular24)、批量改稿(Regular12)、不再反复(Regular12)、cafe+U+0301 空格 台(Regular10)、隐藏标注(Regular9，隐藏)。

- 家族 2（思源黑体、思源宋体）；款式组合 3（黑体 Bold、黑体 Regular、宋体 Regular）。
- 字号直方图：36×2、24×1、12×2、10×1、9×1。
- 容器 5、故事 4。
- 字符（故事去重）：S1=7，S2=8（跨 2 框只计一次），S3 宿主单位 7 / 字素 6（U+0301 组合尖音符是 BMP 字符，UTF-16 占 1 单位，但与前面的 e 组合成 1 个字素），S4=4。宿主单位合计 26，字素合计 25。
- 黑体 Regular 12pt 匹配 → 恰好 thread-1、thread-2 两个片段（T04：跨框、非连续、内容不同、不扩大到整框）。
- 字号 35±2pt → 命中 36pt 两段（容差仅用于匹配，展示仍按原值）。

## 颜色口径

对象直接使用的实色（身份去重 3 种）：品牌蓝（4 处：bg-rect、dot-1、cross-board、locked-bg 的填充）、烫金专色（star-1 描边）、烫金专色 50% 淡色（dot-1 描边，独立身份）。

- 库存 6 色板；未使用 4（暖金 CMYK、品牌黄、备用红、噪点图案）。品牌黄仅被渐变配方内部引用，不算对象直接使用。
- 烫金专色(spot, [0,20,100,20]) 与 暖金 CMYK(process, 同值) 视觉相近但身份不同，必须分开统计（C02）。
- 使用中的渐变 5 种（含未支持自由渐变，单列）。

## 渐变口径

- 定义 5：金渐变(默认中点)、金渐变-反向、金渐变(mid25)、径向装饰、自由渐变X。
- 线性配方停靠序列语义等价（正向与反向视为同一配方，方向另记）：金渐变与金渐变-反向合并为 1 配方 2 实例；mid25 是另一配方 1 实例；径向 1 配方 1 实例。
- 去重后配方 3、实例 4、未支持 1。
- “金渐变”同名两定义不同配方，不按名称合并（G02）。

## 覆盖

- 内容未解析对象 2：symbol-badge（符号实例）、weird-container（未知容器）。统计可见其存在，不假报内部内容；任何“未解析”不得计为零。
