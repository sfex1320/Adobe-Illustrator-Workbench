import { useMemo, useRef, useState } from 'react';
import type { ApplySymmetryItem, CommandResult, SymmetrySpec } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { planSymmetry } from '@aiq/core';
import { Badge, Button, Card, EmptyState, Field, Switch } from '@aiq/ui';

/**
 * 对称整理（含实时模式）：
 * - 执行式：预览 → 一次写回（凹形多环严格输出）。
 * - 实时：保存源模型（进入时的对象点集），滑块/参数变化每帧从源模型重算并写回；
 *   宿主端保持整个会话一步可撤销；退出可保留或还原。
 * 如实标注：不做接缝融合与多色外观合并；宿主端实时帧未实机验证。
 */
export function SymmetryView({ workspace }: { workspace: Workspace }) {
  const result = workspace.currentResult();
  const [axis, setAxis] = useState<'x' | 'y'>('x');
  const [position, setPosition] = useState('0');
  const [keepSide, setKeepSide] = useState<'left' | 'right' | 'top' | 'bottom'>('left');
  const [mirrorRebuild, setMirrorRebuild] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 实时会话源模型与查询请求（每帧从源重算，不在结果上迭代）。 */
  const sourceModelRef = useRef<Array<{ objectId: string; points: Array<[number, number]> }> | null>(null);
  const queryRequestRef = useRef<Parameters<Workspace['resolveQuery']>[0] | null>(null);

  const objects = useMemo(
    () => (result?.request.target === 'objects' ? result.objects : []),
    [result],
  );

  /** 实时模式：点集来源为源模型；非实时：当前结果。 */
  const sourceForPlan = liveMode && sourceModelRef.current ? sourceModelRef.current : null;
  const plan = useMemo(() => {
    const targets =
      sourceForPlan ??
      objects
        .filter((o) => o.pathPoints && o.pathPoints.length >= 3)
        .map((o) => ({ objectId: o.objectId, points: o.pathPoints! }));
    if (targets.length === 0) return null;
    const parsed = Number(position);
    if (!Number.isFinite(parsed)) return null;
    return planSymmetry(targets, { axis, position: parsed, keepSide, mirrorRebuild });
  }, [objects, sourceForPlan, axis, position, keepSide, mirrorRebuild]);

  const noPointsCount = objects.filter((o) => !o.pathPoints || (o.pathPoints ?? []).length < 3).length;

  if (!result || result.request.target !== 'objects' || objects.length === 0) {
    return (
      <Card title="对称整理" icon="mirror">
        <EmptyState>请先在「查找」模块查询对象（路径类对象含路径点集时才能切分）。</EmptyState>
      </Card>
    );
  }

  /** 实时帧/最终帧共用的写回逻辑。 */
  const writeFrame = async (live: boolean) => {
    const parsed = Number(position);
    if (!Number.isFinite(parsed)) throw new Error('轴位置必须是数字（pt）');
    // 实时模式：源模型固定；执行模式：从当前结果取点集。
    const targets =
      live && sourceModelRef.current
        ? sourceModelRef.current
        : objects
            .filter((o) => o.pathPoints && o.pathPoints.length >= 3)
            .map((o) => ({ objectId: o.objectId, points: o.pathPoints! }));
    if (targets.length === 0) throw new Error('没有含路径点集的对象，无法执行对称切分');
    const framePlan = planSymmetry(targets, { axis, position: parsed, keepSide, mirrorRebuild });
    const spec: SymmetrySpec = { axis, position: parsed, keepSide, mirrorRebuild };
    const items: ApplySymmetryItem[] = framePlan.map((item) =>
      item.entirelyDiscarded
        ? { objectId: item.objectId }
        : { objectId: item.objectId, rings: item.keptRings },
    );
    if (live) {
      // 实时帧：结果集可能已因上一帧失效 → 先按保存的请求重新查询获取新引用。
      if (queryRequestRef.current) {
        await workspace.resolveQuery(queryRequestRef.current);
      }
      await workspace.applySymmetry({ spec, items, live: true });
    } else {
      const commandResult = await workspace.applySymmetry({ spec, items });
      setOutcome(commandResult);
    }
  };

  const enterLive = async () => {
    setError(null);
    const targets = objects
      .filter((o) => o.pathPoints && o.pathPoints.length >= 3)
      .map((o) => ({ objectId: o.objectId, points: o.pathPoints! }));
    if (targets.length === 0) {
      setError('没有含路径点集的对象，无法进入实时模式');
      return;
    }
    sourceModelRef.current = targets;
    queryRequestRef.current = result.request;
    setLiveMode(true);
    try {
      await writeFrame(true);
    } catch (e) {
      setLiveMode(false);
      sourceModelRef.current = null;
      setError(e instanceof Error ? e.message : '实时模式启动失败');
    }
  };

  const liveFrame = async () => {
    if (!liveMode) return;
    try {
      await writeFrame(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '实时帧失败');
    }
  };

  const exitLive = async (keep: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (keep) {
        // 保留当前帧为最终结果（结束实时会话）。
        await writeFrame(false).catch(async () => {
          // 最终帧需要新鲜结果集；实时帧刚刷新过，此处通常可达。
          await writeFrame(true);
        });
      } else {
        // 还原：撤销整个实时会话（演示端一步；宿主端单步 undo）。
        const undoOutcome = await workspace.undoWrite();
        if (undoOutcome.status !== 'completed') {
          setError(undoOutcome.error?.message ?? '还原失败');
        }
      }
    } finally {
      setLiveMode(false);
      sourceModelRef.current = null;
      queryRequestRef.current = null;
      setBusy(false);
    }
  };

  const applyOnce = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      await writeFrame(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '对称操作失败');
    } finally {
      setBusy(false);
    }
  };

  const keepOptions: Array<'left' | 'right' | 'top' | 'bottom'> =
    axis === 'x' ? ['left', 'right'] : ['top', 'bottom'];

  return (
    <Card title={liveMode ? '对称整理（实时模式中）' : '对称整理'} icon="mirror">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        目标：当前结果中的 {objects.length} 个对象。跨轴路径按交点严格切分（凹形输出多路径段）；
        完全位于舍弃侧的目标被删除；轴另一侧的其他对象不受影响。
      </p>
      <div className="aiq-row" style={{ marginBottom: 8 }}>
        <Field label="对称轴">
          <select
            className="aiq-select"
            value={axis}
            disabled={liveMode}
            onChange={(e) => {
              const next = e.target.value as 'x' | 'y';
              setAxis(next);
              setKeepSide(next === 'x' ? 'left' : 'top');
            }}
            aria-label="对称轴方向"
          >
            <option value="x">垂直线 x =</option>
            <option value="y">水平线 y =</option>
          </select>
        </Field>
        {liveMode ? (
          <Field label={`轴位置（实时滑块，当前 ${position}）`}>
            <input
              type="range"
              min={-200}
              max={200}
              step={1}
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
                void liveFrame();
              }}
              aria-label="轴位置实时滑块"
              style={{ width: 180 }}
            />
          </Field>
        ) : (
          <Field label="轴位置 pt">
            <input
              className="aiq-input"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              aria-label="轴位置"
              style={{ width: 80 }}
            />
          </Field>
        )}
        <Field label="保留侧">
          <select
            className="aiq-select"
            value={keepSide}
            disabled={liveMode}
            onChange={(e) => {
              setKeepSide(e.target.value as 'left' | 'right' | 'top' | 'bottom');
              if (liveMode) void liveFrame();
            }}
            aria-label="保留侧"
          >
            {keepOptions.map((side) => (
              <option key={side} value={side}>
                {side === 'left' ? '左侧' : side === 'right' ? '右侧' : side === 'top' ? '上侧' : '下侧'}
              </option>
            ))}
          </select>
        </Field>
        <Switch
          checked={mirrorRebuild}
          disabled={liveMode}
          onChange={(v) => setMirrorRebuild(v)}
          label="镜像重建另一侧（副本）"
        />
      </div>

      {liveMode ? (
        <div className="aiq-card" style={{ marginBottom: 8, borderColor: 'var(--aiq-accent)' }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong>实时会话中</strong>：源模型已保存，每次参数变化从源模型重算并即时写回；
            整个会话在宿主保持一步可撤销。
          </p>
          <div className="aiq-row">
            <Button variant="primary" icon="check" disabled={busy} onClick={() => void exitLive(true)}>
              保留当前结果
            </Button>
            <Button icon="undo" disabled={busy} onClick={() => void exitLive(false)}>
              还原到会话前
            </Button>
          </div>
        </div>
      ) : null}

      {noPointsCount > 0 && !liveMode ? (
        <p style={{ margin: '0 0 6px', color: 'var(--aiq-warn)' }}>
          {noPointsCount} 个对象没有路径点集（非路径或超出采集上限），将被跳过。
        </p>
      ) : null}

      {plan && plan.length > 0 && !liveMode ? (
        <div style={{ marginBottom: 8 }}>
          <strong>预览</strong>
          <ul className="aiq-stat-list" style={{ marginTop: 4 }}>
            {plan.map((item) => {
              const obj = objects.find((o) => o.objectId === item.objectId);
              return (
                <li key={item.objectId} className="aiq-stat-row">
                  <span className="aiq-stat-label">{obj?.name ?? item.objectId}</span>
                  {item.entirelyDiscarded ? (
                    <Badge tone="demo">整体删除（完全在舍弃侧）</Badge>
                  ) : (
                    <Badge tone="ok">
                      保留 {item.keptRings.length} 环 / {item.keptRings.reduce((n, r) => n + r.length, 0)} 点
                      {item.keptRings.length > 1 ? '（凹形多段）' : ''}
                    </Badge>
                  )}
                  {item.mirrorRings ? <Badge>镜像 {item.mirrorRings.length} 副本</Badge> : null}
                </li>
              );
            })}
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
            ? '对称整理完成。'
            : `部分完成：跳过 ${outcome.skipped.length} 个。`}
          {outcome.undoable ? ' 可撤销。' : ''}
        </p>
      ) : null}
      {!liveMode ? (
        <div className="aiq-row" style={{ marginTop: 10 }}>
          <Button
            variant="primary"
            icon="mirror"
            disabled={busy || !plan || plan.length === 0}
            onClick={() => void applyOnce()}
          >
            {busy ? '执行中……' : '执行对称整理'}
          </Button>
          <Button icon="refresh" disabled={busy || !plan || plan.length === 0} onClick={() => void enterLive()}>
            进入实时模式
          </Button>
          <span style={{ color: 'var(--aiq-text-muted)', fontSize: 12 }}>
            接缝融合与多色外观合并不在本版。
          </span>
        </div>
      ) : null}
    </Card>
  );
}
