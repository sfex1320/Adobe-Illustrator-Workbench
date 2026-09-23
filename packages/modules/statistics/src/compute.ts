/**
 * 统计计算：从快照按范围计算字体、颜色、渐变与覆盖。纯函数。
 *
 * 口径（与产品不可变规则对应）：
 * - 家族数与（家族,款式）数分开；字号用 pt 原值分组；
 * - 字符数按宿主偏移单位与字素两个口径分别汇总，串接故事不重复计数；
 * - 颜色使用（对象填/描）与色板库存分开；专色身份独立，视觉相近不合并；
 * - 渐变配方按停靠序列语义去重（正反向同配方、方向另记），同名不同配方不合并；
 * - 未解析内容单列，不计为零。
 */

import type {
  ColorKind,
  ColorDef,
  GradientDef,
  ObjectRef,
  QueryScope,
  Snapshot,
  TextSpanRef,
} from '@aiq/contracts';
import { reachableObjects } from '@aiq/core';

export interface TextStyleCount {
  fontFamily: string;
  fontStyle: string;
  fontSizePt: number;
  spanCount: number;
  spanIds: string[];
}

export interface TextFamilyStat {
  fontFamily: string;
  spanCount: number;
  styles: Array<{
    fontStyle: string;
    spanCount: number;
    sizes: Array<{ fontSizePt: number; spanCount: number }>;
  }>;
}

export interface TextStatistics {
  families: TextFamilyStat[];
  familyCount: number;
  familyStyleCount: number;
  totalSpans: number;
  containerCount: number;
  storyCount: number;
  hostUnitChars: number;
  graphemeChars: number;
  fontSizeHistogram: Array<{ fontSizePt: number; spanCount: number }>;
  /** 同框多种格式的容器（展示共同/不同值用）。 */
  mixedContainers: Array<{ containerId: string; containerName: string; distinctStyles: number }>;
  styleCounts: TextStyleCount[];
}

export interface ColorUsageStat {
  colorId: string;
  kind: ColorKind;
  name?: string;
  values?: number[];
  previewRgb?: number[];
  /** 例如自由渐变：作为渐变被使用，但配方未解析。 */
  unresolvedReason?: string;
  /** fill/stroke 使用位置总数。 */
  useCount: number;
  roleCounts?: {fill:number;stroke:number};
  objectIds: string[];
}

export interface ColorStatistics {
  usedColors: ColorUsageStat[];
  swatchInventory: Array<{
    colorId: string;
    name?: string;
    kind: ColorKind;
    values?: number[];
    usedDirectly: boolean;
  }>;
  unusedSwatchIds: string[];
  unresolvedColors: Array<{ objectId: string; reason: string }>;
  noneUseCount: number;
}

export interface GradientInstance {
  gradientId: string;
  name?: string;
  usedByObjectIds: string[];
  /** 相对配方正向的方向。 */
  direction: 'forward' | 'reversed';
  kind?: 'linear'|'radial';
  stops?: Array<{offset:number;opacity?:number;color?:ColorDef}>;
}

export interface GradientRecipeStat {
  recipeKey: string;
  kind: 'linear' | 'radial';
  instanceCount: number;
  instances: GradientInstance[];
}

export interface GradientStatistics {
  recipes: GradientRecipeStat[];
  recipeCount: number;
  instanceCount: number;
  unresolved: Array<{ gradientId: string; name?: string; reason: string }>;
}

export interface StatisticsResult {
  scope: QueryScope;
  collectedAtIso: string;
  collectionStamp: string;
  docName: string;
  text: TextStatistics;
  color: ColorStatistics;
  gradient: GradientStatistics;
  coverage: {
    supportedObjectCount: number;
    skippedObjectCount: number;
    skippedEntries: Snapshot['skipped'];
    hiddenInRange: number;
    lockedInRange: number;
    notes: string[];
  };
}

function inRangeObjects(snapshot: Snapshot, scope: QueryScope): ObjectRef[] {
  return reachableObjects(snapshot, scope).filter((o) =>
    (!o.hidden || scope.includeHidden) && (!o.locked || scope.includeLocked));
}

function inRangeSpans(snapshot: Snapshot, reachable: ObjectRef[]): TextSpanRef[] {
  const ids = new Set(reachable.map((o) => o.objectId));
  return snapshot.textSpans.filter((s) => ids.has(s.containerObjectId));
}

export function computeTextStatistics(snapshot: Snapshot, scope: QueryScope): TextStatistics {
  const reachable = inRangeObjects(snapshot, scope);
  const spans = inRangeSpans(snapshot, reachable);

  const styleCounts = new Map<string, TextStyleCount>();
  for (const span of spans) {
    const key = `${span.style.fontFamily}|${span.style.fontStyle}|${span.style.fontSizePt}`;
    const entry = styleCounts.get(key) ?? {
      fontFamily: span.style.fontFamily,
      fontStyle: span.style.fontStyle,
      fontSizePt: span.style.fontSizePt,
      spanCount: 0,
      spanIds: [],
    };
    entry.spanCount += 1;
    entry.spanIds.push(span.spanId);
    styleCounts.set(key, entry);
  }

  const familiesMap = new Map<string, TextFamilyStat>();
  for (const entry of styleCounts.values()) {
    const family =
      familiesMap.get(entry.fontFamily) ??
      ({ fontFamily: entry.fontFamily, spanCount: 0, styles: [] } satisfies TextFamilyStat);
    family.spanCount += entry.spanCount;
    const style = family.styles.find((s) => s.fontStyle === entry.fontStyle);
    if (style) {
      style.spanCount += entry.spanCount;
      const size = style.sizes.find((s) => s.fontSizePt === entry.fontSizePt);
      if (size) size.spanCount += entry.spanCount;
      else style.sizes.push({ fontSizePt: entry.fontSizePt, spanCount: entry.spanCount });
    } else {
      family.styles.push({
        fontStyle: entry.fontStyle,
        spanCount: entry.spanCount,
        sizes: [{ fontSizePt: entry.fontSizePt, spanCount: entry.spanCount }],
      });
    }
    familiesMap.set(entry.fontFamily, family);
  }
  for (const family of familiesMap.values()) {
    family.styles.sort((a, b) => a.fontStyle.localeCompare(b.fontStyle));
    for (const style of family.styles) style.sizes.sort((a, b) => a.fontSizePt - b.fontSizePt);
  }

  const sizeHist = new Map<number, number>();
  for (const entry of styleCounts.values()) {
    sizeHist.set(entry.fontSizePt, (sizeHist.get(entry.fontSizePt) ?? 0) + entry.spanCount);
  }

  const containers = new Map<string, Set<string>>();
  for (const span of spans) {
    const set = containers.get(span.containerObjectId) ?? new Set<string>();
    set.add(`${span.style.fontFamily}|${span.style.fontStyle}|${span.style.fontSizePt}`);
    containers.set(span.containerObjectId, set);
  }
  const mixedContainers: TextStatistics['mixedContainers'] = [];
  for (const [containerId, styles] of containers) {
    if (styles.size > 1) {
      const obj = snapshot.objects.find((o) => o.objectId === containerId);
      mixedContainers.push({
        containerId,
        containerName: obj?.name ?? containerId,
        distinctStyles: styles.size,
      });
    }
  }

  const storyIds = new Set(spans.map((s) => s.storyId));
  // 款式口径：家族 × 款式（Bold/Regular 等）；字号是独立维度，不并入款式。
  const familyStylePairs = new Set(spans.map((s) => `${s.style.fontFamily}|${s.style.fontStyle}`));
  return {
    families: [...familiesMap.values()].sort((a, b) => a.fontFamily.localeCompare(b.fontFamily)),
    familyCount: familiesMap.size,
    familyStyleCount: familyStylePairs.size,
    totalSpans: spans.length,
    containerCount: containers.size,
    storyCount: storyIds.size,
    hostUnitChars: spans.reduce((sum, s) => sum + s.hostUnitLength, 0),
    graphemeChars: spans.reduce((sum, s) => sum + s.graphemeCount, 0),
    fontSizeHistogram: [...sizeHist.entries()]
      .map(([fontSizePt, spanCount]) => ({ fontSizePt, spanCount }))
      .sort((a, b) => a.fontSizePt - b.fontSizePt),
    mixedContainers,
    styleCounts: [...styleCounts.values()].sort(
      (a, b) =>
        a.fontFamily.localeCompare(b.fontFamily) ||
        a.fontStyle.localeCompare(b.fontStyle) ||
        a.fontSizePt - b.fontSizePt,
    ),
  };
}

export function computeColorStatistics(snapshot: Snapshot, scope: QueryScope): ColorStatistics {
  const reachable = inRangeObjects(snapshot, scope);
  const used = new Map<string, ColorUsageStat>();
  let noneUseCount = 0;
  const unresolvedColors: ColorStatistics['unresolvedColors'] = [];

  for (const obj of reachable) {
    for (const use of [obj.fill, obj.stroke, ...obj.textPaints??[]]) {
      if (!use) continue;
      const { color } = use;
      if (color.kind === 'none') {
        noneUseCount += 1;
        continue;
      }
      if (color.kind === 'unknown') {
        unresolvedColors.push({
          objectId: obj.objectId,
          reason: color.unresolvedReason ?? '未知颜色',
        });
        continue;
      }
      const entry = used.get(color.colorId) ?? {
        colorId: color.colorId,
        kind: color.kind,
        name: color.name,
        values: color.values,
        previewRgb: color.previewRgb,
        unresolvedReason: color.unresolvedReason,
        useCount: 0,
        roleCounts: {fill:0,stroke:0},
        objectIds: [],
      };
      entry.useCount += 1;
      if(entry.roleCounts)entry.roleCounts[use.role]+=1;
      if (!entry.objectIds.includes(obj.objectId)) entry.objectIds.push(obj.objectId);
      used.set(color.colorId, entry);
    }
  }

  const usedIds = new Set(used.keys());
  const inventory = snapshot.swatches.map((sw) => ({
    colorId: sw.colorId,
    name: sw.name,
    kind: sw.kind,
    values: sw.values,
    usedDirectly: usedIds.has(sw.colorId),
  }));

  return {
    usedColors: [...used.values()].sort((a, b) => b.useCount - a.useCount),
    swatchInventory: inventory,
    unusedSwatchIds: inventory.filter((s) => !s.usedDirectly).map((s) => s.colorId),
    unresolvedColors,
    noneUseCount,
  };
}

function stopSignature(stops: GradientDef['stops']): string {
  return stops
    .map((stop, i) => `${stop.offset}@${stop.colorId}#${i === stops.length - 1 ? 50 : stop.midpoint ?? 50}%${stop.opacity ?? 100}`)
    .join(';');
}

/** 反转停靠序列（offset 与中点随方向翻转）。 */
function reversedStops(stops: GradientDef['stops']): GradientDef['stops'] {
  return stops
    .slice()
    .reverse()
    .map((stop, i) => ({
      offset: 100 - stop.offset,
      colorId: stop.colorId,
      midpoint: i === stops.length - 1 ? 50 : 100 - (stops[stops.length - 2 - i]?.midpoint ?? 50),
      opacity: stop.opacity,
    }));
}

export function computeGradientStatistics(snapshot: Snapshot, scope: QueryScope): GradientStatistics {
  const reachable = inRangeObjects(snapshot, scope);

  // 对象使用中的渐变（fill/stroke 引用）。
  const gradientUses = new Map<string, Set<string>>();
  for (const obj of reachable) {
    for (const use of [obj.fill, obj.stroke, ...obj.textPaints??[]]) {
      if (use && use.color.kind === 'gradient' && use.color.gradientId) {
        const set = gradientUses.get(use.color.gradientId) ?? new Set<string>();
        set.add(obj.objectId);
        gradientUses.set(use.color.gradientId, set);
      }
    }
  }

  const recipes = new Map<string, GradientRecipeStat>();
  const unresolved: GradientStatistics['unresolved'] = [];

  for (const gradient of snapshot.gradients) {
    if (!gradientUses.has(gradient.gradientId)) continue;
    if (gradient.kind === 'unknown' || gradient.unresolvedReason) {
      unresolved.push({
        gradientId: gradient.gradientId,
        name: gradient.name,
        reason: gradient.unresolvedReason ?? '未支持的渐变类型',
      });
      continue;
    }
    const forwardSig = stopSignature(gradient.stops);
    const backwardSig = stopSignature(reversedStops(gradient.stops));
    // 正反向取规范形式作为配方键：同配方不同方向合并，方向另记。
    const canonical = forwardSig <= backwardSig ? forwardSig : backwardSig;
    const direction = forwardSig <= backwardSig ? 'forward' : 'reversed';
    const recipeKey = `${gradient.kind}:${canonical}`;
    const recipe =
      recipes.get(recipeKey) ??
      ({ recipeKey, kind: gradient.kind, instanceCount: 0, instances: [] } satisfies GradientRecipeStat);
    const usedBy = [...(gradientUses.get(gradient.gradientId) ?? [])];
    recipe.instances.push({
      gradientId: gradient.gradientId,
      name: gradient.name,
      usedByObjectIds: usedBy,
      direction,
      kind: gradient.kind,
      stops: gradient.stops,
    });
    recipe.instanceCount += usedBy.length;
    recipes.set(recipeKey, recipe);
  }

  const instanceCount = [...recipes.values()].reduce((sum, r) => sum + r.instanceCount, 0);
  return {
    recipes: [...recipes.values()],
    recipeCount: recipes.size,
    instanceCount,
    unresolved,
  };
}

export function computeStatistics(snapshot: Snapshot, scope: QueryScope): StatisticsResult {
  const reachable = reachableObjects(snapshot, scope);
  return {
    scope,
    collectedAtIso: snapshot.collectedAtIso,
    collectionStamp: snapshot.collectionStamp,
    docName: snapshot.docName,
    text: computeTextStatistics(snapshot, scope),
    color: computeColorStatistics(snapshot, scope),
    gradient: computeGradientStatistics(snapshot, scope),
    coverage: {
      supportedObjectCount: snapshot.coverage.supportedObjectCount,
      skippedObjectCount: snapshot.coverage.skippedObjectCount,
      skippedEntries: snapshot.skipped,
      hiddenInRange: reachable.filter((o) => o.hidden).length,
      lockedInRange: reachable.filter((o) => o.locked).length,
      notes: snapshot.coverage.notes,
    },
  };
}
