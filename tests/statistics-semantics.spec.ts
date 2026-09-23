/**
 * 统计口径必测案例 T01–T03、C01–C03、G01–G02。
 * 预期数字全部来自 fixtures 人工预期表（expected.ts），不由被测函数生成。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY_SCOPE } from '@aiq/contracts';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { EXPECTED_A } from '@aiq/fixtures';
import {
  computeStatistics,
  computeTextStatistics,
  computeColorStatistics,
  computeGradientStatistics,
} from '@aiq/module-statistics';

// 原人工预期表为“包含隐藏和锁定”的全量口径，必须显式请求。
const scope = { ...DEFAULT_QUERY_SCOPE, includeHidden: true, includeLocked: true };

async function snapshotOfDocA() {
  const adapter = new DemoHostAdapter();
  return adapter.collectSnapshot(scope);
}

describe('统计：文字口径', () => {
  it('T01 同框混合格式：按片段归类，不用首字概括整框', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeTextStatistics(snap, scope);
    expect(stats.totalSpans).toBe(EXPECTED_A.text.allSpans);
    expect(stats.familyCount).toBe(EXPECTED_A.text.families);
    expect(stats.familyStyleCount).toBe(EXPECTED_A.text.familyStyles);

    const mixed = stats.mixedContainers.find((c) => c.containerId === 'title-mixed');
    expect(mixed?.distinctStyles).toBe(3);

    // 混合框的三个片段样式各自统计。
    const bold36 = stats.styleCounts.find(
      (s) => s.fontFamily === '思源黑体' && s.fontStyle === 'Bold' && s.fontSizePt === 36,
    );
    expect(bold36?.spanCount).toBe(1);
    const regular36 = stats.styleCounts.find(
      (s) => s.fontFamily === '思源黑体' && s.fontStyle === 'Regular' && s.fontSizePt === 36,
    );
    expect(regular36?.spanCount).toBe(1);
    const song24 = stats.styleCounts.find(
      (s) => s.fontFamily === '思源宋体' && s.fontSizePt === 24,
    );
    expect(song24?.spanCount).toBe(1);
  });

  it('T03 样式混合值展示：三个款式并存，不静默取第一字', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeTextStatistics(snap, scope);
    const sizes36 = stats.fontSizeHistogram.find((s) => s.fontSizePt === 36);
    expect(sizes36?.spanCount).toBe(EXPECTED_A.text.fontSizeHistogram['36']);
    const histogram = Object.fromEntries(
      stats.fontSizeHistogram.map((h) => [String(h.fontSizePt), h.spanCount]),
    );
    expect(histogram).toEqual({ ...EXPECTED_A.text.fontSizeHistogram });
  });

  it('T02 串接故事跨框：字符、容器、故事计数不重复', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeTextStatistics(snap, scope);
    expect(stats.containerCount).toBe(EXPECTED_A.text.containers);
    expect(stats.storyCount).toBe(EXPECTED_A.text.stories);
    expect(stats.hostUnitChars).toBe(EXPECTED_A.text.hostUnitChars);
    expect(stats.graphemeChars).toBe(EXPECTED_A.text.graphemeChars);

    const story2 = snap.stories.find((s) => s.storyId === 'story-2');
    expect(story2?.containerObjectIds).toEqual(['thread-1', 'thread-2']);
  });

  it('范围切换后统计结果有明确差异（画板 vs 全文件）', async () => {
    const snap = await snapshotOfDocA();
    const full = computeTextStatistics(snap, scope);
    const ab2 = computeTextStatistics(snap, { ...scope, kind: 'artboard', artboardId: 'ab-2' });
    expect(full.totalSpans).toBe(EXPECTED_A.text.allSpans);
    // 封底只有 weird-container（无文字）——文字片段为 0，但不是“未检查”。
    expect(ab2.totalSpans).toBe(0);
    // 全部文字容器都在封面画板内（含隐藏的 hidden-note）。
    const ab1 = computeTextStatistics(snap, { ...scope, kind: 'artboard', artboardId: 'ab-1' });
    expect(ab1.totalSpans).toBe(EXPECTED_A.text.allSpans);
  });
});

describe('统计：颜色口径', () => {
  it('C01 相同颜色多处使用：种类去重、使用位置分别保留', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeColorStatistics(snap, scope);
    const brandBlue = stats.usedColors.find((c) => c.colorId === 'sw:sw-brand-blue');
    expect(brandBlue).toBeDefined();
    expect(brandBlue?.useCount).toBe(EXPECTED_A.color.brandBlueUses);
    expect(brandBlue?.objectIds.sort()).toEqual(['bg-rect', 'cross-board', 'dot-1', 'locked-bg']);
    const solidUsed = stats.usedColors.filter((c) => c.kind !== 'gradient');
    expect(solidUsed).toHaveLength(EXPECTED_A.color.usedSolidKinds);
  });

  it('C02 视觉相近的专色与印刷色：身份不同不合并', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeColorStatistics(snap, scope);
    const spot = stats.usedColors.find((c) => c.colorId === 'sw:sw-gold-spot');
    expect(spot?.kind).toBe('spot');
    const warmGold = stats.swatchInventory.find((c) => c.colorId === 'sw:sw-warm-gold');
    // 暖金 CMYK 与烫金专色数值相同（[0,20,100,20]），但库存独立存在。
    expect(warmGold?.values).toEqual([0, 20, 100, 20]);
    expect(spot?.values).toEqual([0, 20, 100, 20]);
    // 两者不会合并成一个条目。
    const ids = new Set(stats.usedColors.map((c) => c.colorId));
    expect(ids.has('sw:sw-gold-spot')).toBe(true);
    expect(ids.has('sw:sw-warm-gold')).toBe(false); // 暖金未被对象直接使用
    // 专色淡色（tint）身份独立。
    const tint = stats.usedColors.find((c) => c.kind === 'spot-tint');
    expect(tint?.colorId).toBe('tint:sw-gold-spot:50');
    expect(EXPECTED_A.color.spotVsProcessSeparated).toBe(true);
  });

  it('C03 未使用色板与实际使用分开', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeColorStatistics(snap, scope);
    expect(stats.swatchInventory).toHaveLength(EXPECTED_A.color.swatchCount);
    expect(stats.unusedSwatchIds.sort()).toEqual(
      ['sw:sw-brand-yellow', 'sw:sw-noise-pattern', 'sw:sw-unused-red', 'sw:sw-warm-gold'],
    );
    expect(EXPECTED_A.color.unusedSwatches).toBe(4);
  });

  it('渐变使用（含未解析自由渐变）单列，不计为零', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeColorStatistics(snap, scope);
    const gradientUsed = stats.usedColors.filter((c) => c.kind === 'gradient');
    expect(gradientUsed).toHaveLength(EXPECTED_A.color.usedGradientKinds);
    const freeform = gradientUsed.find((c) => c.colorId === 'grad:gr-freeform-x');
    expect(freeform?.unresolvedReason).toContain('自由渐变');
  });
});

describe('统计：渐变口径', () => {
  it('G01 同配方不同名称/方向：配方去重、实例与方向另记', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeGradientStatistics(snap, scope);
    expect(stats.recipeCount).toBe(EXPECTED_A.gradient.dedupedRecipes);
    expect(stats.instanceCount).toBe(EXPECTED_A.gradient.instances);

    // 金渐变（默认中点）与其反向定义合并为同一配方的两个实例。
    const goldRecipe = stats.recipes.find(
      (r) => r.kind === 'linear' && r.instances.length === 2,
    );
    expect(goldRecipe).toBeDefined();
    const names = goldRecipe?.instances.map((i) => i.name);
    expect(names).toContain('金渐变');
    expect(names).toContain('金渐变-反向');
    const directions = goldRecipe?.instances.map((i) => i.direction).sort();
    expect(directions).toEqual(['forward', 'reversed']);
  });

  it('G02 同名不同配方与自由渐变：不按名称误合并，未支持类型明确显示', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeGradientStatistics(snap, scope);
    // “金渐变”名称出现在两个不同配方中。
    const recipesWithGoldName = stats.recipes.filter((r) =>
      r.instances.some((i) => i.name === '金渐变'),
    );
    expect(recipesWithGoldName).toHaveLength(2);
    // 自由渐变进入未支持列表而不是被当作已解析配方。
    expect(stats.unresolved).toHaveLength(EXPECTED_A.gradient.unsupported);
    expect(stats.unresolved[0]?.name).toBe('自由渐变X');
  });

  it('全量统计结果与人工预期表一致', async () => {
    const snap = await snapshotOfDocA();
    const stats = computeStatistics(snap, scope);
    expect(stats.text.familyCount).toBe(EXPECTED_A.text.families);
    expect(stats.text.totalSpans).toBe(EXPECTED_A.text.allSpans);
    expect(stats.gradient.recipeCount).toBe(EXPECTED_A.gradient.dedupedRecipes);
    expect(stats.coverage.skippedObjectCount).toBe(EXPECTED_A.coverage.skippedObjects);
    expect(stats.coverage.hiddenInRange).toBe(1);
    expect(stats.coverage.lockedInRange).toBe(1);
    expect(stats.docName).toContain('画册封面');
  });
});
