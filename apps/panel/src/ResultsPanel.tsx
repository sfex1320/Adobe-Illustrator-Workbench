import { useState } from 'react';
import { OBJECT_KIND_LABELS, type CommandResult } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card } from '@aiq/ui';

const MAX_ITEMS = 50;

/** 共享结果区：对象与文字片段分别标记；受限与覆盖如实显示。 */
export function ResultsPanel({
  workspace,
  onActionError,
  demoExtensions,
}: {
  workspace: Workspace;
  onActionError: (message: string) => void;
  demoExtensions?: {
    addToSelection(ids: string[]): void;
    currentSelectionIds(): string[];
  } | null;
}) {
  const result = workspace.currentResult();
  const [busy, setBusy] = useState(false);
  const [lastCommand, setLastCommand] = useState<CommandResult | null>(null);

  const selectionActive = workspace.registry.isActive('selection');

  const runSelection = async (mode: 'objects' | 'locate-containers') => {
    setBusy(true);
    setLastCommand(null);
    try {
      const commandResult = await workspace.selectFromCurrentResult(mode);
      setLastCommand(commandResult);
    } catch (e) {
      onActionError(e instanceof Error ? e.message : '选择操作失败');
    } finally {
      setBusy(false);
    }
  };

  if (!result) {
    return null;
  }

  const isSpans = result.request.target === 'text-spans';

  return (
    <Card title="查询结果" icon="panel">
      <p style={{ margin: '0 0 8px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={isSpans ? 'demo' : 'ok'}>
          {isSpans ? `文字片段 × ${result.textSpans.length}` : `对象 × ${result.dedupedTargetCount}`}
        </Badge>
        {result.restricted.length > 0 ? (
          <Badge tone="demo">受限 {result.restricted.length}（隐藏/锁定，未包含）</Badge>
        ) : null}
        {result.coverage.skippedObjectCount > 0 ? (
          <Badge tone="demo" title="符号实例与未知容器内容未解析">
            未解析 {result.coverage.skippedObjectCount}
          </Badge>
        ) : null}
      </p>

      <div className="aiq-row" style={{ marginBottom: 8 }}>
        {isSpans ? (
          <Button
            variant="primary"
            icon="doc"
            disabled={busy || !selectionActive}
            title={
              selectionActive
                ? '选中片段所在的整个文本框（整框定位，不是片段选择）'
                : '当前环境暂不支持对象选择'
            }
            onClick={() => void runSelection('locate-containers')}
          >
            定位所在文本框（整框）
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="check"
            disabled={busy || !selectionActive}
            title={selectionActive ? '选择结果中的全部对象（受限对象自动跳过）' : '当前环境暂不支持对象选择'}
            onClick={() => void runSelection('objects')}
          >
            选择这些对象
          </Button>
        )}
        <Button icon="close" onClick={() => workspace.clearResult()}>
          清空结果
        </Button>
      </div>

      {lastCommand ? (
        <p
          role="status"
          style={{
            margin: '0 0 8px',
            color: lastCommand.status === 'completed' ? 'var(--aiq-ok)' : 'var(--aiq-warn)',
          }}
        >
          {lastCommand.status === 'completed'
            ? `已选择 ${lastCommand.selectedObjectIds.length} 个对象。`
            : lastCommand.status === 'partial' ? `部分完成：选择 ${lastCommand.selectedObjectIds.length} 个，跳过 ${lastCommand.skipped.length} 个。` : lastCommand.error?.message ?? '选择未完成，请重新查询后重试。'}
          {lastCommand.skipped.length > 0
            ? ` 跳过原因：${[...new Set(lastCommand.skipped.map((s) => s.reason))].join('；')}。`
            : ''}
        </p>
      ) : null}

      {isSpans ? (
        <ul className="aiq-stat-list">
          {result.textSpans.slice(0, MAX_ITEMS).map((span) => {
            const container = workspace
              .currentSnapshot()
              ?.objects.find((o) => o.objectId === span.containerObjectId);
            const preview = span.text.length > 14 ? `${span.text.slice(0, 14)}…` : span.text;
            return (
              <li key={span.spanId} className="aiq-result-item">
                <Badge tone="demo">片段</Badge>
                <div style={{ minWidth: 0 }}>
                  <div>
                    “{preview}” · {span.style.fontFamily} {span.style.fontStyle} {span.style.fontSizePt}pt
                  </div>
                  <div className="aiq-path" title={`片段范围 ${span.start}–${span.end}，点击上方按钮定位整个文本框`}>所在框：{container?.name || '未命名文本框'}</div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="aiq-stat-list">
          {result.objects.slice(0, MAX_ITEMS).map((obj) => (
            <li key={obj.objectId} className="aiq-result-item">
              <Badge>{OBJECT_KIND_LABELS[obj.kind]}</Badge>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div>
                  {obj.name ?? '（未命名）'}
                  {obj.flags.clipGroup ? '（剪切组）' : ''}
                  {obj.flags.clipPathFor ? '（蒙版路径）' : ''}
                  {obj.flags.insideClipGroup ? '（剪切组内）' : ''}
                  {obj.artboardIds.length > 1 ? `（跨 ${obj.artboardIds.length} 画板，计 1 次）` : ''}
                </div>
                <div className="aiq-path">{obj.hierarchicalPath.join(' / ')}</div>
              </div>
              {demoExtensions ? (
                <Button
                  onClick={() => demoExtensions.addToSelection([obj.objectId])}
                  title="把该对象加入演示选区（供“当前选区”范围查询）"
                >
                  加入选区
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {(isSpans ? result.textSpans.length : result.objects.length) > MAX_ITEMS ? (
        <p style={{ margin: '8px 0 0', color: 'var(--aiq-text-muted)' }}>
          共 {isSpans ? result.textSpans.length : result.objects.length} 项，仅显示前 {MAX_ITEMS} 项。
        </p>
      ) : null}

      {result.restricted.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <strong style={{ color: 'var(--aiq-warn)' }}>受限目标（不在结果内）</strong>
          <ul className="aiq-stat-list" style={{ marginTop: 4 }}>
            {result.restricted.map((r) => (
              <li key={r.objectId} className="aiq-result-item">
                <Badge tone="demo">受限</Badge>
                <div style={{ minWidth: 0 }}>
                  <div>{r.label}</div>
                  <div className="aiq-path">{r.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
