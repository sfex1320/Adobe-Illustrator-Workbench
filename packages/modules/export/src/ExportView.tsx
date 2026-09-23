import { useMemo, useState } from 'react';
import type { CommandResult, ExportFormat, ExportTaskSpec } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card, EmptyState, Field } from '@aiq/ui';

/**
 * 导出队列：多用途输出任务列表，依序执行并如实报告每个任务状态。
 * 演示环境：JSON 报告真实下载；图片/PDF 如实标注“需真实宿主”。
 * 真实宿主（未实机验证）：PNG/JPEG/PDF 经 exportFile/saveAs 输出。
 */
export function ExportView({ workspace }: { workspace: Workspace }) {
  const [tasks, setTasks] = useState<ExportTaskSpec[]>([
    { name: '预览图', format: 'png', scalePct: 100 },
    { name: '印刷稿', format: 'pdf', scalePct: 100 },
    { name: '对象报告', format: 'report', scalePct: 100 },
  ]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CommandResult['exportResults'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDemo = workspace.getHostInfo().adapterKind === 'demo';
  const document = workspace.getDocument();

  const patchTask = (index: number, patch: Partial<ExportTaskSpec>) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const runAll = async () => {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const outcome = await workspace.exportFiles({ tasks });
      setResults(outcome.exportResults ?? []);
      if (outcome.status === 'failed' && outcome.error) {
        setError(outcome.error.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  const formatLabels: Record<ExportFormat, string> = useMemo(
    () => ({ png: 'PNG', jpeg: 'JPEG', pdf: 'PDF', report: 'JSON 报告' }),
    [],
  );

  return (
    <Card title="导出队列" icon="doc">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        文档：{document?.name ?? '（无文档）'}。任务依序执行，逐项报告真实结果；
        {isDemo
          ? ' 演示环境：JSON 报告会真实下载；PNG/JPEG/PDF 需要真实 Illustrator 宿主。'
          : ' 宿主导出（PNG/JPEG/PDF）需在 Illustrator 中运行（当前未实机验证）。'}
      </p>
      <ul className="aiq-stat-list" style={{ marginBottom: 10 }}>
        {tasks.map((task, index) => {
          const result = results?.[index];
          return (
            <li key={index} className="aiq-result-item">
              <Field label="用途名">
                <input
                  className="aiq-input"
                  value={task.name}
                  onChange={(e) => patchTask(index, { name: e.target.value })}
                  aria-label={`任务${index + 1}名称`}
                  style={{ width: 120 }}
                />
              </Field>
              <Field label="格式">
                <select
                  className="aiq-select"
                  value={task.format}
                  onChange={(e) => patchTask(index, { format: e.target.value as ExportFormat })}
                  aria-label={`任务${index + 1}格式`}
                >
                  {(Object.keys(formatLabels) as ExportFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {formatLabels[f]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="倍率 %">
                <input
                  className="aiq-input"
                  value={String(task.scalePct)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) patchTask(index, { scalePct: n });
                  }}
                  aria-label={`任务${index + 1}倍率`}
                  style={{ width: 70 }}
                />
              </Field>
              {result ? (
                <Badge tone={result.status === 'done' ? 'ok' : 'demo'}>
                  {result.status === 'done' ? '完成' : result.status === 'unsupported' ? '不支持' : '失败'}
                </Badge>
              ) : null}
              <Button
                aria-label={`删除任务${index + 1}`}
                onClick={() => setTasks((prev) => prev.filter((_, i) => i !== index))}
              >
                删除
              </Button>
            </li>
          );
        })}
      </ul>
      {results ? (
        <div style={{ marginBottom: 8 }}>
          {results.map((r, i) =>
            r.message ? (
              <p key={i} style={{ margin: '2px 0', fontSize: 12, color: r.status === 'done' ? 'var(--aiq-ok)' : 'var(--aiq-warn)' }}>
                {r.name}：{r.message}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
      {error ? (
        <p className="aiq-error-text" role="alert" style={{ margin: '0 0 8px' }}>
          {error}
        </p>
      ) : null}
      <div className="aiq-row">
        <Button icon="doc" onClick={() => setTasks((prev) => [...prev, { name: `用途${prev.length + 1}`, format: 'png', scalePct: 100 }])}>
          添加任务
        </Button>
        <Button variant="primary" icon="check" disabled={busy || tasks.length === 0} onClick={() => void runAll()}>
          {busy ? '导出中……' : `执行全部（${tasks.length} 项）`}
        </Button>
      </div>
      {tasks.length === 0 ? <EmptyState>队列中没有任务。</EmptyState> : null}
    </Card>
  );
}
