/** 字素计数：宿主偏移单位（UTF-16）与视觉字素是两个口径，统计分别报告。 */

type SegmenterLike = {
  segment(text: string): Iterable<{ segment: string }>;
};

let segmenter: SegmenterLike | undefined;

function getSegmenter(): SegmenterLike | undefined {
  if (segmenter) return segmenter;
  const intl = Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: string }) => SegmenterLike };
  if (typeof intl.Segmenter === 'function') {
    segmenter = new intl.Segmenter('zh', { granularity: 'grapheme' });
  }
  return segmenter;
}

export function graphemeCount(text: string): number {
  const seg = getSegmenter();
  if (seg) {
    let count = 0;
    for (const _ of seg.segment(text)) count += 1;
    return count;
  }
  // 回退口径：码点数（无组合字符场景下与字素一致）。
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}
