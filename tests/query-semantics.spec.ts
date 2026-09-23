/**
 * 查询语义必测案例 A01–A06、T04、T05（范围/穿透/去重/受限/隔离）。
 * 快照来自演示适配器，查询经核心引擎；预期数字来自 fixtures 人工预期表。
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY_SCOPE } from '@aiq/contracts';
import type { QueryScope } from '@aiq/contracts';
import { resolveQuery } from '@aiq/core';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { EXPECTED_A } from '@aiq/fixtures';

const docScope: QueryScope = { ...DEFAULT_QUERY_SCOPE };

describe('查询语义（演示样例 + 核心引擎）', () => {
  it('A02 三层嵌套组与多画板：快照含全部节点，跨画板对象文档总计去重', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);

    expect(snap.objects).toHaveLength(EXPECTED_A.totalNodes);
    expect(snap.objects.filter((o) => o.kind === 'group')).toHaveLength(EXPECTED_A.groupNodes);

    const star = snap.objects.find((o) => o.objectId === 'star-1');
    expect(star?.hierarchicalPath).toEqual(['底稿层', '主图形', '内部组', '五角星']);

    const cross = snap.objects.find((o) => o.objectId === 'cross-board');
    expect(cross?.artboardIds).toHaveLength(2);

    const result = resolveQuery(snap, { scope: docScope, target: 'objects' });
    expect(result.objects).toHaveLength(EXPECTED_A.query.defaultDocumentHit);
    // 跨画板对象在文档总计只计一次。
    expect(result.objects.filter((o) => o.objectId === 'cross-board')).toHaveLength(1);
    expect(result.dedupedTargetCount).toBe(EXPECTED_A.query.defaultDocumentHit);
    // 穿透模式下组本身不是目标。
    expect(result.objects.some((o) => o.kind === 'group')).toBe(false);
  });

  it('A01 空选区查询返回空结果，不回退全文件', async () => {
    const adapter = new DemoHostAdapter();
    adapter.setSelection([]);
    const snap = await adapter.collectSnapshot({ ...docScope, kind: 'selection' });
    const result = resolveQuery(snap, {
      scope: { ...docScope, kind: 'selection' },
      target: 'objects',
    });
    expect(result.objects).toHaveLength(0);
    expect(result.dedupedTargetCount).toBe(EXPECTED_A.query.emptySelectionHit);
    expect(result.restricted).toHaveLength(0);
  });

  it('选区范围命中演示选区中的对象', async () => {
    const adapter = new DemoHostAdapter();
    adapter.setSelection(['star-1', 'dot-1']);
    const snap = await adapter.collectSnapshot({ ...docScope, kind: 'selection' });
    const result = resolveQuery(snap, {
      scope: { ...docScope, kind: 'selection' },
      target: 'objects',
    });
    expect(result.objects.map((o) => o.objectId).sort()).toEqual(['dot-1', 'star-1']);
    expect(result.dedupedTargetCount).toBe(EXPECTED_A.query.selectionHit);
  });

  it('A03 剪切组：默认只查内容；含蒙版路径开关后蒙版进入；不穿透时整组为目标', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);

    const defaultResult = resolveQuery(snap, { scope: docScope, target: 'objects' });
    expect(defaultResult.objects.some((o) => o.objectId === 'photo')).toBe(true);
    expect(defaultResult.objects.some((o) => o.objectId === 'clip-mask')).toBe(false);

    const withMask = resolveQuery(snap, {
      scope: { ...docScope, includeMaskPaths: true },
      target: 'objects',
    });
    expect(withMask.objects).toHaveLength(EXPECTED_A.query.withMaskPathsHit);
    const mask = withMask.objects.find((o) => o.objectId === 'clip-mask');
    expect(mask?.flags.clipPathFor).toBe('clip-photo');

    const noPierce = resolveQuery(snap, {
      scope: { ...docScope, pierceClipGroups: false },
      target: 'objects',
    });
    expect(noPierce.objects.some((o) => o.objectId === 'photo')).toBe(false);
    expect(noPierce.objects.some((o) => o.objectId === 'clip-mask')).toBe(false);
    const clipGroup = noPierce.objects.find((o) => o.objectId === 'clip-photo');
    expect(clipGroup?.flags.clipGroup).toBe(true);
    expect(noPierce.objects).toHaveLength(EXPECTED_A.query.noPierceClipHit);

    const noPierceGroups = resolveQuery(snap, {
      scope: { ...docScope, pierceGroups: false },
      target: 'objects',
    });
    expect(noPierceGroups.objects.map((o) => o.objectId)).toContain('group-main');
    expect(noPierceGroups.objects.some((o) => o.objectId === 'star-1')).toBe(false);
    expect(noPierceGroups.objects).toHaveLength(EXPECTED_A.query.noPierceGroupHit);
  });

  it('A04 隐藏/锁定对象：统计可见（快照内），查询默认受限并说明原因，开关后包含', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);

    // 统计口径：快照含隐藏与锁定对象。
    expect(snap.objects.some((o) => o.objectId === 'hidden-note' && o.hidden)).toBe(true);
    expect(snap.objects.some((o) => o.objectId === 'locked-bg' && o.locked)).toBe(true);

    const result = resolveQuery(snap, { scope: docScope, target: 'objects' });
    expect(result.objects.some((o) => o.objectId === 'hidden-note')).toBe(false);
    expect(result.objects.some((o) => o.objectId === 'locked-bg')).toBe(false);
    expect(result.restricted).toHaveLength(EXPECTED_A.query.defaultRestricted);
    const reasons = result.restricted.map((r) => r.reason).sort();
    expect(reasons).toEqual(['对象已锁定', '对象已隐藏']);

    const including = resolveQuery(snap, {
      scope: { ...docScope, includeHidden: true, includeLocked: true },
      target: 'objects',
    });
    expect(including.objects.some((o) => o.objectId === 'hidden-note')).toBe(true);
    expect(including.objects.some((o) => o.objectId === 'locked-bg')).toBe(true);
  });

  it('A05 符号与未知容器：进入未解析列表，不假报全部扫描', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);
    expect(snap.skipped.map((s) => s.objectId).sort()).toEqual(['symbol-badge', 'weird-container']);
    expect(snap.coverage.skippedObjectCount).toBe(EXPECTED_A.coverage.skippedObjects);
    expect(snap.coverage.notes.length).toBeGreaterThan(0);
    // 未解析对象本身可被查询到（作为对象），但内容不深入。
    const result = resolveQuery(snap, {
      scope: docScope,
      target: 'objects',
      objectsFilter: { kinds: ['symbol-instance'] },
    });
    expect(result.objects.map((o) => o.objectId)).toEqual(['symbol-badge']);
  });

  it('A06 不同文档存在同名对象：引用按文档会话隔离', async () => {
    const adapter = new DemoHostAdapter();
    const snapA = await adapter.collectSnapshot(docScope);
    const resultA = resolveQuery(snapA, {
      scope: docScope,
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    // 文档 A 含“五角星/五角星二/五角星三”三个同名系对象，全部归属文档 A。
    expect(resultA.objects.map((o) => o.objectId).sort()).toEqual(['star-1', 'star-2', 'star-3']);
    expect(resultA.objects.every((o) => o.docSessionId === 'demo-doc-a')).toBe(true);

    await adapter.setActiveDocument('demo-doc-b');
    const snapB = await adapter.collectSnapshot(docScope);
    const resultB = resolveQuery(snapB, {
      scope: docScope,
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    expect(resultB.objects.map((o) => o.objectId)).toEqual(['star-1']);
    expect(resultB.docSessionId).toBe('demo-doc-b');
    // 同名对象 star-1 在两份快照中的引用按文档身份区分，不会跨文档选错。
    const aStar = resultA.objects.find((o) => o.objectId === 'star-1');
    expect(aStar?.docSessionId).toBe('demo-doc-a');
    expect(resultA.docSessionId).not.toBe(resultB.docSessionId);
    expect(snapB.objects).toHaveLength(EXPECTED_A.docB.nodes);
  });

  it('画板范围：封面/封底各自命中数正确', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);
    const ab1 = resolveQuery(snap, {
      scope: { ...docScope, kind: 'artboard', artboardId: 'ab-1' },
      target: 'objects',
    });
    expect(ab1.objects).toHaveLength(EXPECTED_A.query.artboard1Hit);
    const ab2 = resolveQuery(snap, {
      scope: { ...docScope, kind: 'artboard', artboardId: 'ab-2' },
      target: 'objects',
    });
    expect(ab2.objects.map((o) => o.objectId).sort()).toEqual(['cross-board', 'weird-container']);
  });

  it('T04 同样式不同内容的非连续片段：只命中片段，不扩大到整框正文', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);
    const result = resolveQuery(snap, {
      scope: docScope,
      target: 'text-spans',
      objectsFilter: {
        textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 12 },
      },
    });
    expect(result.textSpans).toHaveLength(EXPECTED_A.text.heiRegular12Spans);
    expect(result.textSpans.map((s) => s.text).sort()).toEqual(['不再反复', '批量改稿']);
    // 片段结果不包含任何整框对象。
    expect(result.objects).toHaveLength(0);
    // 同家族其他字号不命中。
    const other = resolveQuery(snap, {
      scope: docScope,
      target: 'text-spans',
      objectsFilter: { textStyle: { fontFamily: '思源黑体', fontStyle: 'Regular', fontSizePt: 36 } },
    });
    expect(other.textSpans.map((s) => s.text)).toEqual(['工作台']);
  });

  it('字号容差仅作用于匹配：35±2pt 命中 36pt 片段', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);
    const result = resolveQuery(snap, {
      scope: docScope,
      target: 'text-spans',
      objectsFilter: {
        textStyle: { fontSizePt: 35, fontSizeTolerancePt: 2 },
      },
    });
    expect(result.textSpans).toHaveLength(EXPECTED_A.text.sizeTolerance35);
    expect(result.textSpans.every((s) => s.style.fontSizePt === 36)).toBe(true);
  });

  it('T05 组合字符：宿主单位偏移寻址与字素计数是两个口径', async () => {
    const adapter = new DemoHostAdapter();
    const snap = await adapter.collectSnapshot(docScope);
    const span = snap.textSpans.find((s) => s.containerObjectId === 'unicode-sample');
    expect(span).toBeDefined();
    expect(span?.text).toBe('cafe\u0301 台');
    expect(span?.hostUnitLength).toBe(EXPECTED_A.text.unicodeSpan.hostUnits);
    expect(span?.graphemeCount).toBe(EXPECTED_A.text.unicodeSpan.graphemes);
    expect(span?.end).toBeDefined();
    expect(span?.start).toBeDefined();
    expect(span!.end - span!.start).toBe(span!.hostUnitLength);
    // 宿主单位偏移必须落在容器内容范围内。
    expect(span?.start).toBe(0);
  });
});
