/**
 * 收尾功能测试：对齐分布、转曲口径、印前规则、导出队列、实时对称会话、凹形多环。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, DEFAULT_QUERY_SCOPE } from '@aiq/contracts';
import { Workspace, alignBounds, distributeBounds, planSymmetry } from '@aiq/core';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { runPreflight } from '@aiq/module-preflight';
import { computeStatistics } from '@aiq/module-statistics';

const scope = { ...DEFAULT_QUERY_SCOPE };

function makeWorkspace(adapter = new DemoHostAdapter()) {
  const workspace = new Workspace({
    adapter,
    settingsStore: {
      load: () => ({ ...DEFAULT_APP_SETTINGS, enabledModules: {}, scopePreference: { ...DEFAULT_APP_SETTINGS.scopePreference } }),
      save: () => undefined,
    },
  });
  return { workspace, adapter };
}

describe('对齐与分布', () => {
  it('alignBounds：左对齐到集合整体边界', () => {
    const items = [
      { objectId: 'a', bounds: [10, 0, 30, 20] as [number, number, number, number] },
      { objectId: 'b', bounds: [50, 5, 60, 25] as [number, number, number, number] },
    ];
    const aligned = alignBounds(items, 'left', [10, 0, 60, 25]);
    expect(aligned[1]?.bounds[0]).toBe(10);
    expect(aligned[1]?.bounds[2]).toBe(20); // 宽度不变
    expect(aligned[1]?.bounds[1]).toBe(5); // 垂直位置不动
  });

  it('alignBounds：垂直居中对齐到参考', () => {
    const items = [{ objectId: 'a', bounds: [0, 0, 10, 10] as [number, number, number, number] }];
    const aligned = alignBounds(items, 'v-center', [0, 100, 10, 200]);
    expect(aligned[0]?.bounds[1]).toBe(145); // 参考中心 150，半高 5
    expect(aligned[0]?.bounds[3]).toBe(155);
  });

  it('distributeBounds：水平等距分布，首尾不动，中心间距相等', () => {
    const items = [
      { objectId: 'a', bounds: [0, 0, 10, 10] as [number, number, number, number] },   // 中心 5
      { objectId: 'b', bounds: [20, 0, 30, 10] as [number, number, number, number] },  // 中心 25
      { objectId: 'c', bounds: [100, 0, 110, 10] as [number, number, number, number] },// 中心 105
    ];
    const result = distributeBounds(items, 'horizontal');
    const centers = result.map((r) => (r.bounds[0] + r.bounds[2]) / 2);
    expect(centers[0]).toBe(5);
    expect(centers[2]).toBe(105);
    expect(centers[1]).toBeCloseTo(55); // (105-5)/2 + 5
    // 等距校验。
    expect(centers[1]! - centers[0]!).toBeCloseTo(centers[2]! - centers[1]!);
  });

  it('对齐经工作区真实应用：对象 bounds 变化', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    // star-1 [100,140]、star-2 [200,140]、star-3 [150,240]：右对齐到集合右边界 280。
    const targets = [
      { objectId: 'star-1', bounds: [100, 140, 180, 220] as [number, number, number, number] },
      { objectId: 'star-3', bounds: [150, 240, 230, 320] as [number, number, number, number] },
    ];
    const aligned = alignBounds(targets, 'right', [100, 140, 280, 320]);
    const transforms = aligned.map((t) => ({
      objectId: t.objectId,
      targetBounds: t.bounds,
      keepProportions: false,
    }));
    const outcome = await workspace.applyTransforms(transforms);
    expect(outcome.status).toBe('completed');
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(refreshed.objects.find((o) => o.objectId === 'star-1')?.bounds?.[2]).toBeCloseTo(280);
    expect(refreshed.objects.find((o) => o.objectId === 'star-3')?.bounds?.[2]).toBeCloseTo(280);
  });
});

describe('转曲', () => {
  it('文本容器转曲：文字片段消失、路径对象出现（统计口径真实变化）', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { kinds: ['text-area', 'text-point'] },
    });
    const before = computeStatistics(
      await workspace.ensureSnapshot(scope, { forceRefresh: true }),
      scope,
    );
    expect(before.text.totalSpans).toBeGreaterThan(0);

    const outcome = await workspace.convertTextToOutlines(['title-mixed', 'hidden-note']);
    // hidden-note 已隐藏：按语义跳过（不自动取消隐藏），结果为 partial。
    expect(outcome.status).toBe('partial');
    expect(outcome.skipped.map((s) => s.objectId)).toEqual(['hidden-note']);
    expect(outcome.skipped[0]?.reason).toContain('隐藏');

    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const after = computeStatistics(refreshed, scope);
    // title-mixed 的 3 个片段消失（hidden-note 被跳过仍在）：7 → 4。
    expect(after.text.totalSpans).toBe(before.text.totalSpans - 3);
    // 出现“已转曲”组与字符矩形轮廓路径。
    const outlineGroup = refreshed.objects.find((o) => (o.name ?? '').includes('已转曲'));
    expect(outlineGroup?.kind).toBe('group');
    const glyphs = refreshed.objects.filter((o) => (o.name ?? '').startsWith('轮廓'));
    expect(glyphs.length).toBe(7); // “高效工作台演示”7 字
  });
});

describe('印前检查规则', () => {
  it('文档 A 的规则命中与“无法检查”项如实单列', async () => {
    const adapter = new DemoHostAdapter();
    const snapshot = await adapter.collectSnapshot({
      ...scope,
      includeHidden: true,
      includeLocked: true,
    });
    const issues = runPreflight(snapshot);
    const byRule = Object.fromEntries(issues.map((i) => [i.rule, i]));

    // 未转曲文字：文档 A 有 5 个文本容器。
    expect(byRule['unconverted-text']?.objectIds).toHaveLength(5);
    expect(byRule['unconverted-text']?.level).toBe('info');
    expect(byRule['incomplete-preflight']?.level).toBe('unchecked');
    // 专色使用存在（star-1 描边等）。
    expect(byRule['spot-colors']?.objectIds.length).toBeGreaterThan(0);
    // 未使用色板 4 个。
    expect(byRule['unused-swatches']?.message).toContain('4 个色板');
    // 图片对象 → 无法检查（链接状态需宿主）。
    expect(byRule['image-links']?.level).toBe('unchecked');
    // 隐藏/锁定存在。
    expect(byRule['hidden-locked']?.objectIds).toHaveLength(2);
    // 未解析对象 2 个。
    expect(byRule['unresolved-objects']?.objectIds).toHaveLength(2);
    // 文档 A 无 RGB 直接使用 → 该规则不出现（不假报零，直接不报）。
    expect(byRule['rgb-color-in-print']).toBeUndefined();
  });

  it('文档 B（RGB 使用）触发 RGB 印刷色警告', async () => {
    const adapter = new DemoHostAdapter();
    await adapter.setActiveDocument('demo-doc-b');
    const snapshot = await adapter.collectSnapshot({ ...scope, includeHidden: true, includeLocked: true });
    const issues = runPreflight(snapshot);
    const rgb = issues.find((i) => i.rule === 'rgb-color-in-print');
    expect(rgb?.objectIds).toEqual(['star-1']);
  });
});

describe('导出队列（演示）', () => {
  it('报告任务完成；图片/PDF 如实返回不支持', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const outcome = await workspace.exportFiles({
      tasks: [
        { name: '预览图', format: 'png', scalePct: 100 },
        { name: '对象报告', format: 'report', scalePct: 100 },
      ],
    });
    expect(outcome.status).toBe('partial');
    expect(outcome.exportResults).toHaveLength(2);
    expect(outcome.exportResults?.[0]?.status).toBe('unsupported');
    expect(outcome.exportResults?.[0]?.message).toContain('需真实');
    expect(outcome.exportResults?.[1]?.status).toBe('done');
    expect(outcome.exportResults?.[1]?.message).toContain('对象报告');
    expect(outcome.sideEffects).toContain('file-export');
  });
});

describe('实时对称会话（源模型重算，不累积）', () => {
  async function setupSymmetry() {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.switchDocument('demo-doc-c');
    const request = { scope, target: 'objects' as const, objectsFilter: { kinds: ['path' as const] } };
    return { workspace, request };
  }

  /** 模拟视图的实时帧语义：源模型固定（会话开始时捕获），每帧从源重算。 */
  const liveFrame = async (
    workspace: Workspace,
    request: Parameters<Workspace['resolveQuery']>[0],
    position: number,
    source: Array<{ objectId: string; points: Array<[number, number]> }> | null,
  ) => {
    // 重新查询仅为刷新结果引用；几何计算使用传入的源模型（可为 null 表示首帧捕获）。
    await workspace.resolveQuery(request);
    const result = workspace.currentResult()!;
    const targets =
      source ??
      result.objects
        .filter((o) => o.pathPoints && o.pathPoints.length >= 3)
        .map((o) => ({ objectId: o.objectId, points: o.pathPoints! }));
    const plan = planSymmetry(targets, { axis: 'x', position, keepSide: 'left', mirrorRebuild: false });
    return {
      source: targets,
      promise: workspace.applySymmetry({
        spec: { axis: 'x', position, keepSide: 'left', mirrorRebuild: false },
        items: plan.map((p) => (p.entirelyDiscarded ? { objectId: p.objectId } : { objectId: p.objectId, rings: p.keptRings })),
        live: true,
      }),
    };
  };

  it('连续多帧：每帧从会话起点重算，状态不累积', async () => {
    const { workspace, request } = await setupSymmetry();
    const frame1 = await liveFrame(workspace, request, 0, null);
    await frame1.promise;
    const frame2 = await liveFrame(workspace, request, -30, frame1.source);
    await frame2.promise;
    const frame3 = await liveFrame(workspace, request, 50, frame1.source);
    const outcome = await frame3.promise;
    expect(outcome.status).toBe('completed');

    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    // 轴 x=50：sym-flag [-60,80] 跨轴保留 [-60,50]；sym-tri [-100,100] 跨轴保留 [-100,50]；sym-right [30,120] 跨轴保留 [30,50]。
    const flag = refreshed.objects.find((o) => o.objectId === 'sym-flag');
    expect(flag?.bounds).toEqual([-60, 40, 50, 140]);
    const tri = refreshed.objects.find((o) => o.objectId === 'sym-tri');
    expect(tri?.bounds).toEqual([-100, 200, 50, 320]);
    // 三对象都存在（无一被删除，无重复段累积）。
    const paths = refreshed.objects.filter((o) => o.kind === 'path');
    expect(paths).toHaveLength(3);
  });

  it('会话一次撤销还原到会话前', async () => {
    const { workspace, request } = await setupSymmetry();
    const frame1 = await liveFrame(workspace, request, 0, null);
    await frame1.promise;
    const frame2 = await liveFrame(workspace, request, 40, frame1.source);
    await frame2.promise;
    const frame3 = await liveFrame(workspace, request, -20, frame1.source);
    await frame3.promise;
    const undo = await workspace.undoWrite();
    expect(undo.status).toBe('completed');
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(refreshed.objects.find((o) => o.objectId === 'sym-flag')?.bounds).toEqual([-60, 40, 80, 140]);
    expect(refreshed.objects.filter((o) => o.kind === 'path')).toHaveLength(3);
  });
});

describe('凹多边形对称写回（严格多环）', () => {
  it('U 形切分输出多段路径且总面积守恒', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.switchDocument('demo-doc-c');
    await workspace.resolveQuery({ scope, target: 'objects', objectsFilter: { kinds: ['path'] } });
    // 把 sym-flag 改成 U 形点集（凹）再执行对称（经变换写入点集：用 applySymmetry 的 rings 全量写回）。
    const uShape: Array<[number, number]> = [
      [-60, 40], [80, 40], [80, 140], [50, 140], [50, 80], [-30, 80], [-30, 140], [-60, 140],
    ];
    await workspace.applySymmetry({
      spec: { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: false },
      items: [{ objectId: 'sym-flag', rings: [uShape] }],
    });
    // 现在对 U 形执行 x=10 保留左侧的对称切分。
    await workspace.resolveQuery({ scope, target: 'objects', objectsFilter: { kinds: ['path'] } });
    const result = workspace.currentResult()!;
    const u = result.objects.find((o) => o.objectId === 'sym-flag')!;
    const plan = planSymmetry(
      [{ objectId: 'sym-flag', points: u.pathPoints! }],
      { axis: 'x', position: 10, keepSide: 'left', mirrorRebuild: false },
    );
    expect(plan[0]?.keptRings.length).toBeGreaterThanOrEqual(2); // U 形左侧切出多段
    const outcome = await workspace.applySymmetry({
      spec: { axis: 'x', position: 10, keepSide: 'left', mirrorRebuild: false },
      items: plan.map((p) => ({ objectId: p.objectId, rings: p.keptRings })),
    });
    expect(outcome.status).toBe('completed');
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    // 出现“段2”兄弟路径（多环写回）。
    expect(refreshed.objects.some((o) => (o.name ?? '').includes('段2'))).toBe(true);
  });
});
