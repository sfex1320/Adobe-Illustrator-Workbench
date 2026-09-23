/**
 * 几何纯函数：半平面裁剪（SH）、镜像、等比变换。
 * 预期坐标全部人工推算。
 */

import { describe, expect, it } from 'vitest';
import {
  boundsOfPoints,
  clipPolygonHalfPlane,
  clipPolygonHalfPlaneRings,
  halfPlaneFor,
  mirrorPoints,
  planSymmetry,
  planTransform,
  ringsArea,
  triangulatePolygon,
} from '@aiq/core';

describe('半平面裁剪（Sutherland–Hodgman）', () => {
  it('矩形跨垂直轴：保留左侧得到闭合四边形', () => {
    const rect: Array<[number, number]> = [
      [-60, 40],
      [80, 40],
      [80, 140],
      [-60, 140],
    ];
    const kept = clipPolygonHalfPlane(rect, { axis: 'x', position: 0, keep: 'less' });
    // 人工推算：[-60,40] → [0,40] → [0,140] → [-60,140]。
    expect(kept).toEqual([
      [-60, 40],
      [0, 40],
      [0, 140],
      [-60, 140],
    ]);
    expect(boundsOfPoints(kept)).toEqual([-60, 40, 0, 140]);
  });

  it('三角形跨轴：保留左侧得到三点三角形（交点落在斜边端点）', () => {
    const tri: Array<[number, number]> = [
      [-100, 200],
      [100, 200],
      [0, 320],
    ];
    const kept = clipPolygonHalfPlane(tri, { axis: 'x', position: 0, keep: 'less' });
    expect(kept).toEqual([
      [-100, 200],
      [0, 200],
      [0, 320],
    ]);
  });

  it('对象整体在轴另一侧：结果为空（应整体删除）', () => {
    const right: Array<[number, number]> = [
      [30, 340],
      [120, 340],
      [120, 395],
      [30, 395],
    ];
    expect(clipPolygonHalfPlane(right, { axis: 'x', position: 0, keep: 'less' })).toEqual([]);
  });

  it('对象完全在保留侧：点集不变', () => {
    const left: Array<[number, number]> = [
      [-50, 0],
      [-10, 0],
      [-10, 30],
      [-50, 30],
    ];
    const kept = clipPolygonHalfPlane(left, { axis: 'x', position: 0, keep: 'less' });
    expect(kept).toEqual(left);
  });

  it('水平轴与 greater 方向：保留下侧', () => {
    const rect: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const kept = clipPolygonHalfPlane(rect, { axis: 'y', position: 40, keep: 'greater' });
    expect(boundsOfPoints(kept)).toEqual([0, 40, 100, 100]);
  });
});

describe('镜像与计划', () => {
  it('镜像点集关于 x=position 反射且反转环序', () => {
    const pts: Array<[number, number]> = [
      [10, 0],
      [30, 0],
      [30, 20],
    ];
    const mirrored = mirrorPoints(pts, 'x', 0);
    expect(mirrored).toEqual([
      [-30, 20],
      [-30, 0],
      [-10, 0],
    ]);
  });

  it('planSymmetry：跨轴保留 + 镜像标记 + 整体删除标记', () => {
    const plan = planSymmetry(
      [
        { objectId: 'a', points: [[-60, 40], [80, 40], [80, 140], [-60, 140]] },
        { objectId: 'b', points: [[30, 340], [120, 340], [120, 395], [30, 395]] },
      ],
      { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: true },
    );
    expect(plan[0]?.entirelyDiscarded).toBe(false);
    expect(plan[0]?.keptRings).toHaveLength(1);
    expect(plan[0]?.keptPoints).toHaveLength(4);
    expect(plan[0]?.mirrorRings).not.toBeNull();
    expect(plan[1]?.entirelyDiscarded).toBe(true);
    expect(plan[1]?.mirrorRings).toBeNull();
  });

  it('凹多边形（U 形）跨轴：多环输出、无退化边、面积守恒', () => {
    // U 形（凹）：外框 100×100，挖槽 x∈[30,70]、y∈[40,100]（40×60）。
    const uShape: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 100],
      [70, 100],
      [70, 40],
      [30, 40],
      [30, 100],
      [0, 100],
    ];
    // 垂直轴 x=50 从凹槽正中穿过：保留左侧。
    const rings = clipPolygonHalfPlaneRings(uShape, { axis: 'x', position: 50, keep: 'less' });
    expect(rings.length).toBeGreaterThanOrEqual(2); // 上横梁 + 下左腿（三角化输出）
    // 无退化环：每环面积 > 0。
    for (const ring of rings) {
      expect(ringsArea([ring])).toBeGreaterThan(0.001);
      expect(ring.length).toBeGreaterThanOrEqual(3);
    }
    // 面积守恒：总面积 = 10000 - 40×60 = 7600；左半 = 50×100 - 20×60 = 3800。
    expect(ringsArea(rings)).toBeCloseTo(3800, 6);
  });

  it('凸多边形仍输出单环（SH 直接路径）', () => {
    const rect: Array<[number, number]> = [
      [-60, 40],
      [80, 40],
      [80, 140],
      [-60, 140],
    ];
    const rings = clipPolygonHalfPlaneRings(rect, { axis: 'x', position: 0, keep: 'less' });
    expect(rings).toHaveLength(1);
    expect(ringsArea(rings)).toBeCloseTo(60 * 100, 6);
  });

  it('三角化：简单多边形面积守恒', () => {
    const penta: Array<[number, number]> = [
      [0, 0],
      [40, -10],
      [80, 0],
      [90, 40],
      [45, 70],
      [0, 40],
    ];
    const tris = triangulatePolygon(penta);
    expect(tris.length).toBe(penta.length - 2);
    const total = tris.reduce((sum, tri) => sum + ringsArea([[tri[0]!, tri[1]!, tri[2]!]]), 0);
    expect(total).toBeCloseTo(ringsArea([penta]), 6);
  });

  it('halfPlaneFor：x 轴 left/right 与 y 轴 top/bottom 的方向正确', () => {
    expect(halfPlaneFor('x', 5, 'left')).toEqual({ axis: 'x', position: 5, keep: 'less' });
    expect(halfPlaneFor('x', 5, 'right').keep).toBe('greater');
    expect(halfPlaneFor('y', 5, 'top').keep).toBe('less');
    expect(halfPlaneFor('y', 5, 'bottom').keep).toBe('greater');
  });
});

describe('planTransform 尺寸计划', () => {
  it('等比模式：按较小比例缩放并在目标内居中', () => {
    // 100×50 放进 60×60 目标：比例 min(0.6, 1.2)=0.6 → 60×30，居中于 y。
    const target = planTransform([0, 0, 100, 50], [10, 10, 70, 70], true);
    expect(target[0]).toBeCloseTo(10);
    expect(target[1]).toBeCloseTo(10 + (60 - 30) / 2);
    expect(target[2] - target[0]).toBeCloseTo(60);
    expect(target[3] - target[1]).toBeCloseTo(30);
  });

  it('拉伸模式：精确到目标边界', () => {
    const target = planTransform([0, 0, 100, 50], [0, 0, 60, 60], false);
    expect(target).toEqual([0, 0, 60, 60]);
  });
});
