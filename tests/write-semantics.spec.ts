/**
 * 写入语义：文字批改、尺寸统一、替换、对称、撤销。
 * 全部经 Workspace 写入服务（校验 + 调度 + 失效），断言真实数据变化。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, DEFAULT_QUERY_SCOPE } from '@aiq/contracts';
import { Workspace } from '@aiq/core';
import { planSymmetry } from '@aiq/core';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { moduleBundle as textWriteBundle } from '@aiq/module-text-write';
import { moduleBundle as symmetryBundle } from '@aiq/module-symmetry';

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

describe('文字批改写入', () => {
  it('批量改字号真实生效：重新查询统计口径变化', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    // 先查询 12pt 的两个片段。
    const result = await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 12 } },
    });
    expect(result.textSpans).toHaveLength(2);

    const outcome = await workspace.applyTextStyleChanges(
      result.textSpans.map((span) => ({
        spanId: span.spanId,
        start: span.start,
        end: span.end,
        fontSizePt: 14,
      })),
    );
    expect(outcome.status).toBe('completed');
    expect(outcome.sideEffects).toContain('text-style-write');
    expect(outcome.undoable).toBe(true);

    // 写入后重新查询：12pt 不再命中，14pt 命中 2 片段。
    const stale = await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 12 } },
    });
    expect(stale.textSpans).toHaveLength(0);
    const fresh = await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 14 } },
    });
    expect(fresh.textSpans).toHaveLength(2);
    expect(fresh.textSpans.map((s) => s.text).sort()).toEqual(['不再反复', '批量改稿']);
  });

  it('隐藏容器的片段被跳过（partial），不自动取消隐藏', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    // 含隐藏片段：hidden-note 是 9pt。
    const result = await workspace.resolveQuery({
      scope: { ...scope, includeHidden: true },
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 9 } },
    });
    expect(result.textSpans).toHaveLength(1);

    const outcome = await workspace.applyTextStyleChanges([
      { spanId: result.textSpans[0]!.spanId, start: 0, end: 4, fontSizePt: 11 },
    ]);
    expect(outcome.status).toBe('failed');
    expect(outcome.skipped[0]?.reason).toContain('隐藏');
    // 重新查询：9pt 仍在（未写入）。
    const after = await workspace.resolveQuery({
      scope: { ...scope, includeHidden: true },
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 9 } },
    });
    expect(after.textSpans).toHaveLength(1);
  });

  it('没有查询结果时写入被拒绝', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await expect(
      workspace.applyTextStyleChanges([{ spanId: 'x#0', fontSizePt: 12 }]),
    ).rejects.toMatchObject({ code: 'SELECTION_EMPTY' });
  });
});

describe('尺寸统一定变换', () => {
  it('等比适配参考对象：目标 bounds 与宽高比保持', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const result = await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    const star1 = result.objects.find((o) => o.objectId === 'star-1')!;
    const star2 = result.objects.find((o) => o.objectId === 'star-2')!;
    const before = star2.bounds!;

    const outcome = await workspace.applyTransforms([
      {
        objectId: 'star-2',
        targetBounds: star1.bounds!,
        keepProportions: true,
      },
    ]);
    expect(outcome.status).toBe('completed');

    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const star2After = refreshed.objects.find((o) => o.objectId === 'star-2')!;
    expect(star2After.bounds).toEqual(star1.bounds);
    // 80×80 → 80×80：等比后一致；确认旧值确实不同来源。
    expect(before[2] - before[0]).toBe(80);
  });

  it('拉伸模式精确到目标边界', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { nameIncludes: '圆点' },
    });
    await workspace.applyTransforms([
      { objectId: 'dot-1', targetBounds: [0, 0, 100, 50], keepProportions: false },
    ]);
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(refreshed.objects.find((o) => o.objectId === 'dot-1')?.bounds).toEqual([0, 0, 100, 50]);
  });
});

describe('替换', () => {
  it('复制替换：副本进入目标位置、原目标删除', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const result = await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    expect(result.objects).toHaveLength(3);

    const outcome = await workspace.replaceObjects({
      sourceObjectId: 'star-1',
      targetObjectIds: ['star-2', 'star-3'],
      mode: 'copy-in-place',
      removeTargets: true,
    });
    expect(outcome.status).toBe('completed');
    expect(outcome.selectedObjectIds).toHaveLength(2);

    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(refreshed.objects.some((o) => o.objectId === 'star-2')).toBe(false);
    expect(refreshed.objects.some((o) => o.objectId === 'star-3')).toBe(false);
    const copies = refreshed.objects.filter((o) => (o.name ?? '').includes('副本'));
    expect(copies).toHaveLength(2);
    // 副本等比适配原目标边界。
    const copyBounds = copies.map((c) => c.bounds!).sort((a, b) => a[0] - b[0]);
    for (const b of copyBounds) {
      expect(b[2] - b[0]).toBe(80);
      expect(b[3] - b[1]).toBe(80);
    }
    expect(refreshed.objects.some((o) => o.objectId === 'star-1')).toBe(true);
  });

  it('交换位置：来源与首个目标 bounds 互换', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({ scope, target: 'objects' });
    const outcome = await workspace.replaceObjects({
      sourceObjectId: 'star-1',
      targetObjectIds: ['dot-1'],
      mode: 'swap',
      removeTargets: false,
    });
    expect(outcome.status).toBe('completed');
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    // star-1 原 [100,140,180,220]，dot-1 原 [350,140,390,180]。
    expect(refreshed.objects.find((o) => o.objectId === 'star-1')?.bounds?.[0]).toBeCloseTo(350);
    expect(refreshed.objects.find((o) => o.objectId === 'dot-1')?.bounds?.[0]).toBeCloseTo(100);
  });
});

describe('对称整理（执行式）', () => {
  async function setupSymmetry() {
    const { workspace, adapter } = makeWorkspace();
    await workspace.initialize();
    await workspace.switchDocument('demo-doc-c');
    const result = await workspace.resolveQuery({
      scope,
      target: 'objects',
      objectsFilter: { kinds: ['path'] },
    });
    expect(result.objects).toHaveLength(3);
    return { workspace, adapter, result };
  }

  it('跨轴对象按交点切分、整体舍弃侧删除、轴外不受影响', async () => {
    const { workspace } = await setupSymmetry();
    const refreshed0 = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const flag = refreshed0.objects.find((o) => o.objectId === 'sym-flag')!;

    const plan = planSymmetry(
      refreshed0.objects
        .filter((o) => o.pathPoints)
        .map((o) => ({ objectId: o.objectId, points: o.pathPoints! })),
      { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: false },
    );
    // 预览：旗形保留左半（4 点）、三角保留左半（3 点）、右侧小形整体删除。
    expect(plan.find((p) => p.objectId === 'sym-flag')?.keptPoints).toHaveLength(4);
    expect(plan.find((p) => p.objectId === 'sym-tri')?.keptPoints).toHaveLength(3);
    expect(plan.find((p) => p.objectId === 'sym-right')?.entirelyDiscarded).toBe(true);
    void flag;

    const outcome = await workspace.applySymmetry({
      spec: { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: false },
      items: plan.map((p) => ({
        objectId: p.objectId,
        points: p.entirelyDiscarded ? undefined : p.keptPoints,
      })),
    });
    expect(outcome.status).toBe('completed');

    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    // 右侧小形被删除；旗形与三角的 bounds 收缩到左半。
    expect(refreshed.objects.some((o) => o.objectId === 'sym-right')).toBe(false);
    const flagAfter = refreshed.objects.find((o) => o.objectId === 'sym-flag')!;
    expect(flagAfter.bounds).toEqual([-60, 40, 0, 140]);
    const triAfter = refreshed.objects.find((o) => o.objectId === 'sym-tri')!;
    expect(triAfter.bounds).toEqual([-100, 200, 0, 320]);
  });

  it('镜像重建：保留半边 + 副本对象出现', async () => {
    const { workspace } = await setupSymmetry();
    const refreshed0 = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const plan = planSymmetry(
      refreshed0.objects
        .filter((o) => o.pathPoints && o.objectId !== 'sym-right')
        .map((o) => ({ objectId: o.objectId, points: o.pathPoints! })),
      { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: true },
    );
    await workspace.applySymmetry({
      spec: { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: true },
      items: plan.map((p) => ({
        objectId: p.objectId,
        points: p.entirelyDiscarded ? undefined : p.keptPoints,
      })),
    });
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const mirrors = refreshed.objects.filter((o) => (o.name ?? '').includes('镜像'));
    expect(mirrors).toHaveLength(2);
    // 镜像副本的 bounds 与保留半边关于轴对称。
    const flagMirror = mirrors.find((m) => (m.name ?? '').includes('跨轴旗形'))!;
    expect(flagMirror.bounds).toEqual([0, 40, 60, 140]);
  });

  it('撤销恢复对称前的结构', async () => {
    const { workspace } = await setupSymmetry();
    const refreshed0 = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    const plan = planSymmetry(
      refreshed0.objects
        .filter((o) => o.pathPoints)
        .map((o) => ({ objectId: o.objectId, points: o.pathPoints! })),
      { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: true },
    );
    await workspace.applySymmetry({
      spec: { axis: 'x', position: 0, keepSide: 'left', mirrorRebuild: true },
      items: plan.map((p) => ({
        objectId: p.objectId,
        points: p.entirelyDiscarded ? undefined : p.keptPoints,
      })),
    });
    const undoOutcome = await workspace.undoWrite();
    expect(undoOutcome.status).toBe('completed');
    const refreshed = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(refreshed.objects).toHaveLength(3);
    expect(refreshed.objects.find((o) => o.objectId === 'sym-right')).toBeDefined();
    expect(refreshed.objects.find((o) => o.objectId === 'sym-flag')?.bounds).toEqual([-60, 40, 80, 140]);
  });
});

describe('撤销与能力', () => {
  it('撤销空栈返回失败说明', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const outcome = await workspace.undoWrite();
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.message).toContain('没有可撤销');
  });

  it('批改 → 撤销 → 统计恢复', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Bold', fontSizePt: 36 } },
    });
    await workspace.applyTextStyleChanges([{ spanId: 'title-mixed#0', start: 0, end: 2, fontFamily: '思源宋体' }]);
    const mid = await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源宋体' } },
    });
    expect(mid.textSpans).toHaveLength(2); // 原“演示” + 改写后的“高效”

    await workspace.undoWrite();
    const after = await workspace.resolveQuery({
      scope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源宋体' } },
    });
    expect(after.textSpans).toHaveLength(1);
  });

  it('适配器不支持写入能力时：模块激活被拒、写入被拒', async () => {
    const adapter = new DemoHostAdapter();
    // 关闭写入能力：覆盖 connect 返回不支持写入的自报能力。
    const originalConnect = adapter.connect.bind(adapter);
    adapter.connect = async () => {
      const info = await originalConnect();
      info.capabilities.writeTextStyles = { supported: false, verifiedOnHost: false, note: '测试关闭' };
      info.capabilities.writePathPoints = { supported: false, verifiedOnHost: false, note: '测试关闭' };
      return info;
    };
    const { workspace } = makeWorkspace(adapter);
    workspace.registerModule(textWriteBundle);
    workspace.registerModule(symmetryBundle);
    await workspace.initialize();

    await expect(workspace.activateModule('text-write')).rejects.toMatchObject({
      code: 'MODULE_MISSING_CAPABILITY',
    });
    await expect(workspace.activateModule('symmetry')).rejects.toMatchObject({
      code: 'MODULE_MISSING_CAPABILITY',
    });

    // 写入服务同样拒绝。
    await workspace.resolveQuery({ scope, target: 'text-spans' });
    await expect(
      workspace.applyTextStyleChanges([{ spanId: 'title-mixed#0', fontSizePt: 12 }]),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  });

  it('写入后旧结果的引用失效（REF_STALE 防重放）', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({ scope, target: 'objects' });
    await workspace.applyTransforms([
      { objectId: 'star-1', targetBounds: [0, 0, 10, 10], keepProportions: false },
    ]);
    // 用旧结果尝试选择：宿主端校验 revision → REF_STALE。
    await expect(workspace.selectFromCurrentResult('objects')).rejects.toMatchObject({
      code: 'REF_STALE',
    });
  });
});
