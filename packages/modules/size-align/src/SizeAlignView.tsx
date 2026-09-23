import { useMemo, useState } from 'react';
import type { CommandResult, ObjectTransform } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { displayLength, alignBounds, distributeBounds, planTransform, type AlignMode } from '@aiq/core';
import { Badge, Button, Card, EmptyState, Field } from '@aiq/ui';

type SizeMode = 'uniform-width' | 'uniform-height' | 'fit-width' | 'fit-height' | 'match-reference';

const MODE_LABELS: Record<SizeMode, string> = {
  'uniform-width': '统一宽度',
  'uniform-height': '统一高度',
  'fit-width': '等比缩放到指定宽',
  'fit-height': '等比缩放到指定高',
  'match-reference': '等比适配参考对象',
};

/**
 * 尺寸统一：对当前对象结果计算目标边界并批量应用。
 * 几何计算用 core.planTransform（等比在内含居中）；写入经统一调度。
 */
export function SizeAlignView({ workspace }: { workspace: Workspace }) {
  const result = workspace.currentResult();
  const [mode, setMode] = useState<SizeMode>('uniform-width');
  const [value, setValue] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const objects = useMemo(
    () => (result?.request.target === 'objects' ? result.objects : []),
    [result],
  );
  const reference = useMemo(
    () => objects.find((o) => o.objectId === referenceId),
    [objects, referenceId],
  );

  const preview = useMemo((): Array<{ objectId: string; label: string; from: string; to: string }> | null => {
    if (objects.length === 0) return null;
    const parsed = value.trim() === '' ? undefined : Number(value);
    if (parsed !== undefined && !Number.isFinite(parsed)) return null;

    const withBounds = objects.filter((o) => o.bounds);
    if (withBounds.length === 0) return null;

    const referenceBounds =
      mode === 'match-reference'
        ? reference?.bounds
        : undefined;
    if (mode === 'match-reference' && !referenceBounds) return null;

    return withBounds.slice(0, 20).map((obj) => {
      const b = obj.bounds!;
      let target: [number, number, number, number];
      switch (mode) {
        case 'uniform-width': {
          const w = parsed ?? b[2] - b[0];
          target = [b[0], b[1], b[0] + w, b[3]];
          break;
        }
        case 'uniform-height': {
          const h = parsed ?? b[3] - b[1];
          target = [b[0], b[1], b[2], b[1] + h];
          break;
        }
        case 'fit-width': {
          const w = parsed ?? b[2] - b[0];
          const scale = w / (b[2] - b[0]);
          const h = (b[3] - b[1]) * scale;
          target = planTransform(b, [b[0], b[1], b[0] + w, b[1] + h], true);
          break;
        }
        case 'fit-height': {
          const h = parsed ?? b[3] - b[1];
          const scale = h / (b[3] - b[1]);
          const w = (b[2] - b[0]) * scale;
          target = planTransform(b, [b[0], b[1], b[0] + w, b[1] + h], true);
          break;
        }
        case 'match-reference': {
          target = planTransform(b, referenceBounds!, true);
          break;
        }
      }
      return {
        objectId: obj.objectId,
        label: obj.name ?? obj.objectId,
        from: `${displayLength(b[2] - b[0], 'pt')}×${displayLength(b[3] - b[1], 'pt')}`,
        to: `${displayLength(target[2] - target[0], 'pt')}×${displayLength(target[3] - target[1], 'pt')}`,
      };
    });
  }, [objects, mode, value, reference]);

  if (!result || result.request.target !== 'objects' || objects.length === 0) {
    return (
      <Card title="尺寸统一" icon="size">
        <EmptyState>请先在「查找」模块查询对象（如按类型“路径”），结果会作为统一尺寸的目标。</EmptyState>
      </Card>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const parsed = value.trim() === '' ? undefined : Number(value);
      if (parsed !== undefined && !Number.isFinite(parsed)) throw new Error('数值必须是数字（pt）');
      if ((mode === 'uniform-width' || mode === 'fit-width' || mode === 'uniform-height' || mode === 'fit-height') && parsed === undefined) {
        throw new Error('请输入目标数值');
      }
      if (mode === 'match-reference' && !reference?.bounds) throw new Error('请选择参考对象');

      const transforms: ObjectTransform[] = [];
      for (const obj of objects) {
        if (!obj.bounds) continue;
        const b = obj.bounds;
        let target: [number, number, number, number];
        let keepProportions = false;
        switch (mode) {
          case 'uniform-width':
            target = [b[0], b[1], b[0] + parsed!, b[3]];
            break;
          case 'uniform-height':
            target = [b[0], b[1], b[2], b[1] + parsed!];
            break;
          case 'fit-width': {
            const scale = parsed! / (b[2] - b[0]);
            const h = (b[3] - b[1]) * scale;
            target = planTransform(b, [b[0], b[1], b[0] + parsed!, b[1] + h], true);
            keepProportions = true;
            break;
          }
          case 'fit-height': {
            const scale = parsed! / (b[3] - b[1]);
            const w = (b[2] - b[0]) * scale;
            target = planTransform(b, [b[0], b[1], b[0] + w, b[1] + parsed!], true);
            keepProportions = true;
            break;
          }
          case 'match-reference':
            target = planTransform(b, reference!.bounds!, true);
            keepProportions = true;
            break;
        }
        transforms.push({ objectId: obj.objectId, targetBounds: target, keepProportions });
      }
      if (transforms.length === 0) throw new Error('没有可应用变换的对象');
      const commandResult = await workspace.applyTransforms(transforms);
      setOutcome(commandResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <Card title="尺寸统一" icon="size">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        目标：当前结果中的 <strong>{objects.length}</strong> 个对象。等比模式在保持宽高比的前提下适配，居中放置。
      </p>
      <div className="aiq-row" style={{ marginBottom: 8 }}>
        <Field label="模式">
          <select
            className="aiq-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as SizeMode)}
            aria-label="尺寸模式"
          >
            {(Object.keys(MODE_LABELS) as SizeMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        {mode !== 'match-reference' ? (
          <Field label={mode.startsWith('uniform-width') || mode === 'fit-width' ? '目标宽 pt' : '目标高 pt'}>
            <input
              className="aiq-input"
              value={value}
              onBlur={()=>{if(value.trim()&&Number.isFinite(Number(value)))setValue(String(Number(Number(value).toFixed(2))));}}
              onChange={(e) => setValue(e.target.value)}
              aria-label="目标数值"
              style={{ width: 90 }}
              placeholder="如 100"
            />
          </Field>
        ) : (
          <Field label="参考对象（等比适配其边界）">
            <select
              className="aiq-select"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              aria-label="参考对象"
            >
              <option value="">（请选择）</option>
              {objects.map((o) => (
                <option key={o.objectId} value={o.objectId}>
                  {o.name ?? o.objectId}（{(o.bounds ? displayLength(o.bounds[2] - o.bounds[0], 'pt') : '?')}×
                  {(o.bounds ? displayLength(o.bounds[3] - o.bounds[1], 'pt') : '?')}）
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {preview && preview.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <strong>预览（宽×高，pt）</strong>
          <ul className="aiq-stat-list" style={{ marginTop: 4 }}>
            {preview.map((row) => (
              <li key={row.objectId} className="aiq-stat-row">
                <span className="aiq-stat-label">{row.label}</span>
                <Badge>
                  {row.from} → {row.to}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="aiq-error-text" role="alert" style={{ margin: '8px 0 0' }}>
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p role="status" style={{ margin: '8px 0 0', color: outcome.status === 'completed' ? 'var(--aiq-ok)' : 'var(--aiq-warn)' }}>
          {outcome.status === 'completed'
            ? '已应用变换。'
            : `部分完成：跳过 ${outcome.skipped.length} 个。`}
          {outcome.skipped.length > 0 ? ` 原因：${[...new Set(outcome.skipped.map((s) => s.reason))].join('；')}。` : ''}
        </p>
      ) : null}
      <div className="aiq-row" style={{ marginTop: 10 }}>
        <Button variant="primary" icon="size" disabled={busy} onClick={() => void apply()}>
          {busy ? '应用中……' : '统一尺寸'}
        </Button>
      </div>
    </Card>
    <AlignDistributeCard workspace={workspace} objects={objects} />
    </div>
  );
}

const ALIGN_LABELS: Record<AlignMode, string> = {
  left: '左对齐',
  'h-center': '水平居中',
  right: '右对齐',
  top: '顶对齐',
  'v-center': '垂直居中',
  bottom: '底对齐',
};

/** 对齐与分布：对当前结果计算平移型目标边界后统一应用。 */
function AlignDistributeCard({
  workspace,
  objects,
}: {
  workspace: Workspace;
  objects: NonNullable<ReturnType<Workspace['currentResult']>>['objects'];
}) {
  const [alignMode, setAlignMode] = useState<AlignMode>('left');
  const [alignTarget, setAlignTarget] = useState<'selection-bounds' | 'first-object'>('selection-bounds');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const withBounds = useMemo(() => objects.filter((o) => o.bounds), [objects]);

  const run = async (transformItems: Array<{ objectId: string; bounds: [number, number, number, number] }>, label: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const transforms: ObjectTransform[] = transformItems
        .filter((t) => {
          const obj = withBounds.find((o) => o.objectId === t.objectId);
          return obj && obj.bounds;
        })
        .map((t) => {
          const obj = withBounds.find((o) => o.objectId === t.objectId)!;
          // 平移到新位置（宽高不变，等比无影响）。
          const moved = planTransform(obj.bounds!, t.bounds, true);
          return { objectId: t.objectId, targetBounds: moved, keepProportions: true };
        });
      if (transforms.length === 0) throw new Error('没有可操作的对象');
      const outcome = await workspace.applyTransforms(transforms);
      setMessage(
        outcome.status === 'completed'
          ? `${label}完成（${transforms.length} 个对象）。`
          : `${label}部分完成：跳过 ${outcome.skipped.length} 个。`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const align = async () => {
    const items = withBounds.map((o) => ({ objectId: o.objectId, bounds: o.bounds! }));
    const reference =
      alignTarget === 'first-object'
        ? (items[0]?.bounds ?? [0, 0, 0, 0])
        : (items.reduce(
            (acc, item) =>
              [
                Math.min(acc[0], item.bounds[0]),
                Math.min(acc[1], item.bounds[1]),
                Math.max(acc[2], item.bounds[2]),
                Math.max(acc[3], item.bounds[3]),
              ] as [number, number, number, number],
            [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
          ));
    await run(alignBounds(items, alignMode, reference), ALIGN_LABELS[alignMode]);
  };

  const distribute = async (direction: 'horizontal' | 'vertical') => {
    const items = withBounds.map((o) => ({ objectId: o.objectId, bounds: o.bounds! }));
    if (items.length < 3) {
      setMessage('等间距分布至少需要 3 个对象（首尾不动）。');
      return;
    }
    await run(distributeBounds(items, direction), direction === 'horizontal' ? '水平分布' : '垂直分布');
  };

  return (
    <Card title="对齐与分布" icon="size">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        作用于当前结果中的 {withBounds.length} 个对象；分布按中心等距，首尾对象位置不动。
      </p>
      <div className="aiq-row" style={{ marginBottom: 8 }}>
        <Field label="对齐方式">
          <select
            className="aiq-select"
            value={alignMode}
            onChange={(e) => setAlignMode(e.target.value as AlignMode)}
            aria-label="对齐方式"
          >
            {(Object.keys(ALIGN_LABELS) as AlignMode[]).map((m) => (
              <option key={m} value={m}>
                {ALIGN_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="对齐参考">
          <select
            className="aiq-select"
            value={alignTarget}
            onChange={(e) => setAlignTarget(e.target.value as 'selection-bounds' | 'first-object')}
            aria-label="对齐参考"
          >
            <option value="selection-bounds">结果集合整体边界</option>
            <option value="first-object">首个对象</option>
          </select>
        </Field>
        <Button variant="primary" icon="check" disabled={busy} onClick={() => void align()}>
          对齐
        </Button>
      </div>
      <div className="aiq-row">
        <Button icon="size" disabled={busy} onClick={() => void distribute('horizontal')}>
          水平等距分布
        </Button>
        <Button icon="size" disabled={busy} onClick={() => void distribute('vertical')}>
          垂直等距分布
        </Button>
      </div>
      {message ? (
        <p role="status" style={{ margin: '8px 0 0' }}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}
