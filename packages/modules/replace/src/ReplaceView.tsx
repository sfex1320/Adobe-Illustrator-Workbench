import { useState } from 'react';
import type { CommandResult } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card, EmptyState, Field, Switch } from '@aiq/ui';

/**
 * 替换：记住来源 B（当前结果中单选），对目标 A（当前结果其余对象）执行
 * “复制到 A 的位置并等比匹配 A 尺寸”，可选删除原 A；或与首个 A 交换位置。
 */
export function ReplaceView({ workspace }: { workspace: Workspace }) {
  const result = workspace.currentResult();
  const [sourceId, setSourceId] = useState('');
  const [mode, setMode] = useState<'copy-in-place' | 'swap'>('copy-in-place');
  const [removeTargets, setRemoveTargets] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const objects = result?.request.target === 'objects' ? result.objects : [];
  const source = objects.find((o) => o.objectId === sourceId);
  const targets = objects.filter((o) => o.objectId !== sourceId);

  if (!result || result.request.target !== 'objects' || objects.length < 2) {
    return (
      <Card title="替换" icon="swap">
        <EmptyState>
          请先在「查找」模块查询对象，且结果中至少包含来源 B 与目标 A 两个对象。
        </EmptyState>
      </Card>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      if (!source) throw new Error('请先选择来源对象 B');
      if (targets.length === 0) throw new Error('除了来源外没有可替换的目标');
      const commandResult = await workspace.replaceObjects({
        sourceObjectId: source.objectId,
        targetObjectIds: mode === 'swap' ? [targets[0]!.objectId] : targets.map((t) => t.objectId),
        mode,
        removeTargets: mode === 'swap' ? false : removeTargets,
      });
      setOutcome(commandResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '替换失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="替换" icon="swap">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        来源 B 从当前结果中选择；替换只作用于结果中的其余对象（显式目标集合，不扩大到全文档）。
      </p>
      <div className="aiq-row" style={{ marginBottom: 8 }}>
        <Field label="来源对象 B（被复制 / 交换的内容）">
          <select
            className="aiq-select"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            aria-label="来源对象"
          >
            <option value="">（请选择来源）</option>
            {objects.map((o) => (
              <option key={o.objectId} value={o.objectId}>
                {o.name ?? o.objectId}（{o.hierarchicalPath.join('/')}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="方式">
          <select
            className="aiq-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'copy-in-place' | 'swap')}
            aria-label="替换方式"
          >
            <option value="copy-in-place">复制替换多个目标</option>
            <option value="swap">与首个目标交换位置</option>
          </select>
        </Field>
      </div>
      {mode === 'copy-in-place' ? (
        <div className="aiq-row" style={{ marginBottom: 8 }}>
          <Switch
            checked={removeTargets}
            onChange={setRemoveTargets}
            label="替换后删除原目标 A"
          />
        </div>
      ) : null}
      <p style={{ margin: '0 0 8px' }}>
        {source ? (
          <>
            将以 <Badge>{source.name ?? source.objectId}</Badge> 替换{' '}
            <strong>{mode === 'swap' ? 1 : targets.length}</strong> 个目标
            （复制件等比适配各目标的边界{removeTargets && mode === 'copy-in-place' ? '，并删除原目标' : ''}）。
          </>
        ) : (
          <span style={{ color: 'var(--aiq-text-muted)' }}>选择来源后显示执行摘要。</span>
        )}
      </p>
      {error ? (
        <p className="aiq-error-text" role="alert" style={{ margin: '8px 0 0' }}>
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p role="status" style={{ margin: '8px 0 0', color: outcome.status === 'completed' ? 'var(--aiq-ok)' : 'var(--aiq-warn)' }}>
          {outcome.status === 'completed'
            ? '替换完成。'
            : `部分完成：跳过 ${outcome.skipped.length} 个。`}
          {outcome.skipped.length > 0 ? ` 原因：${[...new Set(outcome.skipped.map((s) => s.reason))].join('；')}。` : ''}
        </p>
      ) : null}
      <div className="aiq-row" style={{ marginTop: 10 }}>
        <Button variant="primary" icon="swap" disabled={busy || !source} onClick={() => void apply()}>
          {busy ? '替换中……' : mode === 'swap' ? '交换位置' : '执行替换'}
        </Button>
      </div>
    </Card>
  );
}
