/**
 * 查询引擎：从快照按范围与穿透规则解析目标。纯函数，不依赖 DOM 与适配器。
 *
 * 语义要点（对应验收案例）：
 * - 空选区返回空结果，绝不回退全文档（A01）；
 * - 穿透组/嵌套组/剪切组寻找实际子对象，不解组、不释放蒙版（A02/A03）；
 * - 蒙版路径仅在 includeMaskPaths 开启后作为独立目标（A03）；
 * - 隐藏/锁定对象可被统计（快照内），查询默认排除并进受限列表（A04）；
 * - 文档总计按 objectId 去重，跨画板对象计一次（A02）；
 * - 文字片段结果与整框对象分开，不互相冒充（T04/F4）。
 */

import type {
  ObjectRef,
  QueryRequest,
  QueryResult,
  QueryScope,
  RestrictedTarget,
  Snapshot,
  TextSpanRef,
  TextStyleQuery,
} from '@aiq/contracts';

let requestCounter = 0;

function matchesScope(obj: ObjectRef, scope: QueryScope, selectionIds: Set<string>): boolean {
  switch (scope.kind) {
    case 'document':
      return true;
    case 'artboard':
      return scope.artboardId !== undefined && obj.artboardIds.includes(scope.artboardId);
    case 'layer':
      return scope.layerName !== undefined && obj.hierarchicalPath[0] === scope.layerName;
    case 'selection':
      return selectionIds.has(obj.objectId);
    default:
      return false;
  }
}

function matchesStyle(style: TextSpanRef['style'], q: TextStyleQuery): boolean {
  if (q.fontFamily !== undefined && style.fontFamily !== q.fontFamily) return false;
  if (q.fontStyle !== undefined && style.fontStyle !== q.fontStyle) return false;
  if (q.fontSizePt !== undefined) {
    const tolerance = q.fontSizeTolerancePt ?? 0;
    if (Math.abs(style.fontSizePt - q.fontSizePt) > tolerance) return false;
  }
  return true;
}

function matchesObjectFilter(obj: ObjectRef, request: QueryRequest): boolean {
  const filter = request.objectsFilter;
  if (!filter) return true;
  if (filter.kinds !== undefined && !filter.kinds.includes(obj.kind)) return false;
  if (filter.nameIncludes !== undefined) {
    const name = obj.name ?? '';
    if (!name.toLowerCase().includes(filter.nameIncludes.toLowerCase())) return false;
  }
  if (filter.usesColorId !== undefined || filter.usesGradientId !== undefined) {
    const uses = [obj.fill, obj.stroke, ...obj.textPaints??[]].some((use) => {
      if (!use || (filter.colorRole && filter.colorRole !== 'any' && use.role !== filter.colorRole)) return false;
      if (filter.usesColorId !== undefined && use.color.colorId === filter.usesColorId) return true;
      if (filter.usesGradientId !== undefined && use.color.gradientId === filter.usesGradientId) {
        return true;
      }
      return false;
    });
    if (!uses) return false;
  }
  if (filter.textStyle !== undefined) {
    // 样式过滤只作用于文本容器，且不把容器当作片段返回。
    const isText = obj.kind === 'text-point' || obj.kind === 'text-area' || obj.kind === 'text-path';
    if (!isText) return false;
  }
  return true;
}

/**
 * 计算当前穿透规则下的“可达对象集合”。
 * 组在穿透模式下不作为目标（其子节点递归可达）；非穿透模式下组作为整体目标、
 * 子节点不可达。剪切组的蒙版路径只在 includeMaskPaths 时可达。
 * 统计模块与查询共用本函数，保证两侧范围语义一致。
 */
export function reachableObjects(snapshot: Snapshot, scope: QueryScope): ObjectRef[] {
  const byParent = new Map<string, ObjectRef[]>();
  const roots: ObjectRef[] = [];
  for (const obj of snapshot.objects) {
    if (obj.parentId !== undefined) {
      const list = byParent.get(obj.parentId) ?? [];
      list.push(obj);
      byParent.set(obj.parentId, list);
    } else {
      roots.push(obj);
    }
  }

  const selectionIds = new Set(snapshot.selectionObjectIds);
  const reached: ObjectRef[] = [];

  const visit = (source: ObjectRef, parentSelected = false, parentHidden = false, parentLocked = false): void => {
    const obj = { ...source, hidden: source.hidden || parentHidden, locked: source.locked || parentLocked };
    const selected = parentSelected || selectionIds.has(obj.objectId);
    if (selected) selectionIds.add(obj.objectId);
    const isGroup = obj.kind === 'group';
    if (isGroup) {
      const pierce = obj.flags.clipGroup ? scope.pierceClipGroups : scope.pierceGroups;
      if (pierce) {
        // 穿透：组本身不作为目标，递归子节点。蒙版路径受独立开关控制。
        for (const child of byParent.get(obj.objectId) ?? []) {
          const isMaskPath = child.flags.clipPathFor !== undefined;
          if (isMaskPath && !scope.includeMaskPaths) continue;
          visit(child, selected, obj.hidden, obj.locked);
        }
        return;
      }
      // 非穿透：组作为整体目标，不再深入。
      reached.push(obj);
      return;
    }
    reached.push(obj);
  };

  for (const root of roots) visit(root);

  return reached.filter((obj) => matchesScope(obj, scope, selectionIds));
}

function objectLabel(obj: ObjectRef): string {
  return obj.name ? `${obj.name}（${obj.hierarchicalPath.join(' / ')}）` : obj.hierarchicalPath.join(' / ');
}

export function resolveQuery(snapshot: Snapshot, request: QueryRequest): QueryResult {
  const { scope } = request;
  const reachable = reachableObjects(snapshot, scope);
  const restricted: RestrictedTarget[] = [];

  if (request.target === 'objects') {
    const objects: ObjectRef[] = [];
    for (const obj of reachable) {
      if (!matchesObjectFilter(obj, request)) continue;
      if (obj.hidden && !scope.includeHidden) {
        restricted.push({ objectId: obj.objectId, label: objectLabel(obj), reason: '对象已隐藏' });
        continue;
      }
      if (obj.locked && !scope.includeLocked) {
        restricted.push({ objectId: obj.objectId, label: objectLabel(obj), reason: '对象已锁定' });
        continue;
      }
      objects.push(obj);
    }
    // 快照内 objectId 天然唯一；去重口径用于跨画板/重复命中场景。
    const seen = new Set<string>();
    const deduped = objects.filter((obj) => {
      if (seen.has(obj.objectId)) return false;
      seen.add(obj.objectId);
      return true;
    });
    return {
      requestId: `q-${++requestCounter}`,
      createdAtIso: new Date().toISOString(),
      request,
      docSessionId: snapshot.docSessionId,
      collectionStamp: snapshot.collectionStamp,
      objects: deduped,
      textSpans: [],
      dedupedTargetCount: deduped.length,
      restricted,
      coverage: snapshot.coverage,
    };
  }

  // 文字片段目标：容器必须可达，片段按样式过滤；受限容器整体报告。
  const reachableIds = new Set(reachable.map((o) => o.objectId));
  const styleQuery = request.objectsFilter?.textStyle;
  const spans: TextSpanRef[] = [];
  const restrictedSpanCounts = new Map<string, number>();
  const restrictedContainers = new Map<string, ObjectRef>();
  for (const span of snapshot.textSpans) {
    if (!reachableIds.has(span.containerObjectId)) continue;
    if (styleQuery !== undefined && !matchesStyle(span.style, styleQuery)) continue;
    const container = reachable.find((o) => o.objectId === span.containerObjectId);
    if (container === undefined) continue;
    const blocked =
      (container.hidden && !scope.includeHidden) || (container.locked && !scope.includeLocked);
    if (blocked) {
      restrictedSpanCounts.set(
        container.objectId,
        (restrictedSpanCounts.get(container.objectId) ?? 0) + 1,
      );
      restrictedContainers.set(container.objectId, container);
      continue;
    }
    spans.push(span);
  }
  for (const [containerId, container] of restrictedContainers) {
    restricted.push({
      objectId: containerId,
      label: `${container.name ?? '文本对象'}（含 ${restrictedSpanCounts.get(containerId)} 个命中片段）`,
      reason: container.hidden ? '容器对象已隐藏' : '容器对象已锁定',
    });
  }

  return {
    requestId: `q-${++requestCounter}`,
    createdAtIso: new Date().toISOString(),
    request,
    docSessionId: snapshot.docSessionId,
    collectionStamp: snapshot.collectionStamp,
    objects: [],
    textSpans: spans,
    dedupedTargetCount: spans.length,
    restricted,
    coverage: snapshot.coverage,
  };
}

/** 样式规范的显示键：家族 款式 字号pt。 */
export function styleLabel(style: { fontFamily: string; fontStyle: string; fontSizePt: number }): string {
  return `${style.fontFamily} ${style.fontStyle} ${style.fontSizePt}pt`;
}
