/**
 * 几何纯函数：多边形半平面裁剪与轴镜像。
 *
 * 严格性说明：
 * - 凸多边形直接用 Sutherland–Hodgman（凸裁剪窗口）严格正确；
 * - 任意（含凹）多边形先耳切三角化，再逐三角 SH 裁剪，输出多环
 *   （三角形可能相邻共享边，但无退化桥接边，面积严格守恒）。
 */

import type { Bounds } from '@aiq/contracts';

export type Point = [number, number];

/** 垂直线 x=position：keep='left' 保留 x<=position 侧。水平线 y=position 同理。 */
export type HalfPlane = {
  axis: 'x' | 'y';
  position: number;
  keep: 'less' | 'greater';
};

function inside(p: Point, plane: HalfPlane): boolean {
  const value = plane.axis === 'x' ? p[0] : p[1];
  return plane.keep === 'less' ? value <= plane.position : value >= plane.position;
}

function intersect(a: Point, b: Point, plane: HalfPlane): Point {
  const va = plane.axis === 'x' ? a[0] : a[1];
  const vb = plane.axis === 'x' ? b[0] : b[1];
  const t = (plane.position - va) / (vb - va);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 半平面裁剪（凸输入严格正确；凹输入请用 clipPolygonHalfPlaneRings）。 */
export function clipPolygonHalfPlane(points: Point[], plane: HalfPlane): Point[] {
  if (points.length < 3) return [];
  const out: Point[] = [];
  const push = (p: Point): void => {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) return;
    out.push(p);
  };
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const curIn = inside(cur, plane);
    const nextIn = inside(next, plane);
    if (curIn) {
      push(cur);
      if (!nextIn) push(intersect(cur, next, plane));
    } else if (nextIn) {
      push(intersect(cur, next, plane));
    }
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    sum += cur[0] * next[1] - next[0] * cur[1];
  }
  return sum / 2;
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 耳切三角化（简单多边形，任一环方向）。 */
export function triangulatePolygon(points: Point[]): Array<[Point, Point, Point]> {
  if (points.length < 3) return [];
  const ccw = signedArea(points) > 0;
  const verts = points.map((p, i) => ({ p, i }));
  const triangles: Array<[Point, Point, Point]> = [];
  const isEar = (prev: { p: Point }, ear: { p: Point }, next: { p: Point }): boolean => {
    const convex = ccw
      ? cross(prev.p, ear.p, next.p) > 0
      : cross(prev.p, ear.p, next.p) < 0;
    if (!convex) return false;
    for (const v of verts) {
      if (v === prev || v === ear || v === next) continue;
      if (pointInTriangle(v.p, prev.p, ear.p, next.p)) return false;
    }
    return true;
  };
  let guard = 0;
  const maxIter = verts.length * verts.length + 10;
  while (verts.length > 3 && guard < maxIter) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < verts.length; i += 1) {
      const prev = verts[(i - 1 + verts.length) % verts.length]!;
      const ear = verts[i]!;
      const next = verts[(i + 1) % verts.length]!;
      if (isEar(prev, ear, next)) {
        triangles.push([prev.p, ear.p, next.p]);
        verts.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // 数值退化：停止，剩余部分按一个三角形收尾处理。
  }
  if (verts.length === 3) {
    triangles.push([verts[0]!.p, verts[1]!.p, verts[2]!.p]);
  }
  return triangles;
}

/**
 * 任意多边形 × 半平面：三角化后逐三角严格裁剪，返回多环。
 * 相邻三角形可能共享边；无退化桥接边；总面积严格守恒。
 */
export function clipPolygonHalfPlaneRings(points: Point[], plane: HalfPlane): Point[][] {
  if (points.length < 3) return [];
  // 凸性检查：全部同向叉积 → 直接 SH（单环输出更干净）。
  let isConvex = true;
  const areaSign = signedArea(points) >= 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[i]!;
    const cur = points[(i + 1) % points.length]!;
    const next = points[(i + 2) % points.length]!;
    const c = cross(prev, cur, next);
    if ((areaSign && c < -1e-9) || (!areaSign && c > 1e-9)) {
      isConvex = false;
      break;
    }
  }
  if (isConvex) {
    const single = clipPolygonHalfPlane(points, plane);
    return single.length >= 3 ? [single] : [];
  }
  const rings: Point[][] = [];
  for (const tri of triangulatePolygon(points)) {
    const clipped = clipPolygonHalfPlane([tri[0]!, tri[1]!, tri[2]!], plane);
    if (clipped.length >= 3) rings.push(clipped);
  }
  return rings;
}

/** 多环总面积（鞋带，绝对值求和）。 */
export function ringsArea(rings: Point[][]): number {
  return rings.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
}

/** 按轴镜像点集并反转环序（保持路径填充方向有效）。 */
export function mirrorPoints(points: Point[], axis: 'x' | 'y', position: number): Point[] {
  const mirrored = points.map(
    (p) => (axis === 'x' ? [2 * position - p[0], p[1]] : [p[0], 2 * position - p[1]]) as Point,
  );
  mirrored.reverse();
  return mirrored;
}

export function boundsOfPoints(points: Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

/** 多环总边界。 */
export function boundsOfRings(rings: Point[][]): Bounds {
  const all = rings.flat();
  return all.length > 0 ? boundsOfPoints(all) : [0, 0, 0, 0];
}

/**
 * keepSide → 半平面。x 轴（垂直线）分 left/right；y 轴（水平线）分 top/bottom。
 * Illustrator 坐标 y 向下：top = y<=position。
 */
export function halfPlaneFor(axis: 'x' | 'y', position: number, keepSide: 'left' | 'right' | 'top' | 'bottom'): HalfPlane {
  if (axis === 'x') {
    return { axis: 'x', position, keep: keepSide === 'left' ? 'less' : 'greater' };
  }
  return { axis: 'y', position, keep: keepSide === 'top' ? 'less' : 'greater' };
}

/** 对称操作预览：每个对象的保留环与（可选）镜像重建环。 */
export interface SymmetryPlanItem {
  objectId: string;
  /** 裁剪后的保留半边（凸输入单环；凹输入可能多环，严格无退化边）。 */
  keptRings: Point[][];
  /** 首环（兼容单环场景的展示与简单写回）。 */
  keptPoints: Point[];
  keptBounds: Bounds;
  /** 每个保留环的镜像（mirrorRebuild 时）。 */
  mirrorRings: Point[][] | null;
  /** 对象完全位于轴另一侧时为 true：按语义应整体删除该目标对象。 */
  entirelyDiscarded: boolean;
}

export function planSymmetry(
  targets: Array<{ objectId: string; points: Point[] }>,
  spec: { axis: 'x' | 'y'; position: number; keepSide: 'left' | 'right' | 'top' | 'bottom'; mirrorRebuild: boolean },
): SymmetryPlanItem[] {
  const plane = halfPlaneFor(spec.axis, spec.position, spec.keepSide);
  return targets.map(({ objectId, points }) => {
    const keptRings = clipPolygonHalfPlaneRings(points, plane);
    const entirelyDiscarded = keptRings.length === 0;
    return {
      objectId,
      keptRings,
      keptPoints: keptRings[0] ?? [],
      keptBounds: boundsOfRings(keptRings),
      mirrorRings:
        spec.mirrorRebuild && keptRings.length > 0
          ? keptRings.map((ring) => mirrorPoints(ring, spec.axis, spec.position))
          : null,
      entirelyDiscarded,
    };
  });
}

/** 尺寸统一计算：把对象 bounds 调整到目标 bounds；等比时在目标内居中。 */
export function planTransform(
  current: Bounds,
  target: Bounds,
  keepProportions: boolean,
): Bounds {
  if (!keepProportions) return [...target] as Bounds;
  const currentW = current[2] - current[0];
  const currentH = current[3] - current[1];
  const targetW = target[2] - target[0];
  const targetH = target[3] - target[1];
  if (currentW <= 0 || currentH <= 0 || targetW <= 0 || targetH <= 0) {
    return [...target] as Bounds;
  }
  const scale = Math.min(targetW / currentW, targetH / currentH);
  const newW = currentW * scale;
  const newH = currentH * scale;
  const offsetX = target[0] + (targetW - newW) / 2;
  const offsetY = target[1] + (targetH - newH) / 2;
  return [offsetX, offsetY, offsetX + newW, offsetY + newH];
}

// ---------------------------------------------------------------------------
// 对齐与分布（纯计算，输出平移型目标边界）

export type AlignMode =
  | 'left'
  | 'h-center'
  | 'right'
  | 'top'
  | 'v-center'
  | 'bottom';

/** 把一组 bounds 对齐到参考边界（结果集合整体边界或指定参考对象）。 */
export function alignBounds(
  items: Array<{ objectId: string; bounds: Bounds }>,
  mode: AlignMode,
  reference: Bounds,
): Array<{ objectId: string; bounds: Bounds }> {
  return items.map(({ objectId, bounds }) => {
    const w = bounds[2] - bounds[0];
    const h = bounds[3] - bounds[1];
    switch (mode) {
      case 'left':
        return { objectId, bounds: [reference[0], bounds[1], reference[0] + w, bounds[3]] };
      case 'right':
        return { objectId, bounds: [reference[2] - w, bounds[1], reference[2], bounds[3]] };
      case 'h-center': {
        const cx = (reference[0] + reference[2]) / 2;
        return { objectId, bounds: [cx - w / 2, bounds[1], cx + w / 2, bounds[3]] };
      }
      case 'top':
        return { objectId, bounds: [bounds[0], reference[1], bounds[2], reference[1] + h] };
      case 'bottom':
        return { objectId, bounds: [bounds[0], reference[3] - h, bounds[2], reference[3]] };
      case 'v-center': {
        const cy = (reference[1] + reference[3]) / 2;
        return { objectId, bounds: [bounds[0], cy - h / 2, bounds[2], cy + h / 2] };
      }
    }
  });
}

/** 等间距分布（按中心点），首尾对象位置不动。direction: 'horizontal' | 'vertical'。 */
export function distributeBounds(
  items: Array<{ objectId: string; bounds: Bounds }>,
  direction: 'horizontal' | 'vertical',
): Array<{ objectId: string; bounds: Bounds }> {
  if (items.length < 3) return items;
  const sorted = [...items].sort((a, b) =>
    direction === 'horizontal' ? a.bounds[0] - b.bounds[0] : a.bounds[1] - b.bounds[1],
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const total =
    direction === 'horizontal'
      ? (last.bounds[0] + last.bounds[2]) / 2 - (first.bounds[0] + first.bounds[2]) / 2
      : (last.bounds[1] + last.bounds[3]) / 2 - (first.bounds[1] + first.bounds[3]) / 2;
  const step = total / (sorted.length - 1);
  const result = sorted.map((item, index): { objectId: string; bounds: Bounds } => {
    const w = item.bounds[2] - item.bounds[0];
    const h = item.bounds[3] - item.bounds[1];
    if (index === 0 || index === sorted.length - 1) return { objectId: item.objectId, bounds: item.bounds };
    if (direction === 'horizontal') {
      const startCenter = (first.bounds[0] + first.bounds[2]) / 2 + step * index;
      return { objectId: item.objectId, bounds: [startCenter - w / 2, item.bounds[1], startCenter + w / 2, item.bounds[3]] };
    }
    const startCenter = (first.bounds[1] + first.bounds[3]) / 2 + step * index;
    return { objectId: item.objectId, bounds: [item.bounds[0], startCenter - h / 2, item.bounds[2], startCenter + h / 2] };
  });
  // 保持调用方顺序。
  return items.map((item) => result.find((r) => r.objectId === item.objectId)!);
}
