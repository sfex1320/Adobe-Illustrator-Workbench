import { useMemo, useState } from 'react';
import type { CommandResult, TextStyleChange } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card, EmptyState, Field } from '@aiq/ui';

/**
 * 文字批改：把当前文字片段结果的样式批量改写。
 * 引用与新鲜度校验在写入服务统一完成；成功后快照失效，统计需刷新。
 */
export function TextWriteView({ workspace }: { workspace: Workspace }) {
  const result = workspace.currentResult();
  const [fontFamily, setFontFamily] = useState('');
  const [fontStyle, setFontStyle] = useState('');
  const [fontSize, setFontSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(() => {
    const snap = workspace.currentSnapshot();
    if (!snap) return [];
    return [...new Set(snap.textSpans.map((s) => s.style.fontFamily))].sort();
  }, [workspace]);

  if (!result || result.request.target !== 'text-spans' || result.textSpans.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card title="文字批改" icon="text">
          <EmptyState>
            请先在「查找」模块查询文字片段（目标选“查找文字片段”），
            结果会作为批改对象出现在这里。
          </EmptyState>
        </Card>
        {result ? <ConvertOutlinesCard workspace={workspace} result={result} /> : null}
      </div>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const parsedSize = fontSize.trim() === '' ? undefined : Number(fontSize);
      if (parsedSize !== undefined && !Number.isFinite(parsedSize)) {
        throw new Error('字号必须是数字（pt）');
      }
      if (!fontFamily.trim() && !fontStyle.trim() && parsedSize === undefined) {
        throw new Error('至少填写一项要修改的属性（家族 / 款式 / 字号）');
      }
      const changes: TextStyleChange[] = result.textSpans.map((span) => ({
        spanId: span.spanId,
        start: span.start,
        end: span.end,
        fontFamily: fontFamily.trim() === '' ? undefined : fontFamily.trim(),
        fontStyle: fontStyle.trim() === '' ? undefined : fontStyle.trim(),
        fontSizePt: parsedSize,
      }));
      const commandResult = await workspace.applyTextStyleChanges(changes);
      setOutcome(commandResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '批改失败');
    } finally {
      setBusy(false);
    }
  };

  const spanList = result.textSpans.slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card title="文字批改" icon="text">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        将改写当前结果中的 <strong>{result.textSpans.length}</strong> 个文字片段（只改片段，不改整框正文）。
        留空的属性保持原值。写入后旧结果与统计会失效，可刷新查看。
      </p>
      <ul className="aiq-stat-list" style={{ marginBottom: 10 }}>
        {spanList.map((span) => (
          <li key={span.spanId} className="aiq-stat-row">
            <Badge tone="demo">片段</Badge>
            <span className="aiq-stat-label">
              “{span.text.length > 10 ? `${span.text.slice(0, 10)}…` : span.text}” · {span.style.fontFamily}{' '}
              {span.style.fontStyle} {span.style.fontSizePt}pt
            </span>
          </li>
        ))}
        {result.textSpans.length > spanList.length ? (
          <li className="aiq-stat-row">
            <span className="aiq-stat-value">…共 {result.textSpans.length} 个片段</span>
          </li>
        ) : null}
      </ul>
      <div className="aiq-row">
        <Field label="改为家族（空 = 不变）">
          <input
            className="aiq-input"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            list="aiq-tw-families"
            aria-label="目标字体家族"
            placeholder="如：思源黑体"
          />
          <datalist id="aiq-tw-families">
            {families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
        <Field label="改为款式（空 = 不变）">
          <input
            className="aiq-input"
            value={fontStyle}
            onChange={(e) => setFontStyle(e.target.value)}
            aria-label="目标字体款式"
            placeholder="如：Bold"
          />
        </Field>
        <Field label="改为字号 pt（空 = 不变）">
          <input
            className="aiq-input"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            aria-label="目标字号"
            style={{ width: 90 }}
            placeholder="如：14"
          />
        </Field>
      </div>
      {error ? (
        <p className="aiq-error-text" role="alert" style={{ margin: '8px 0 0' }}>
          {error}
        </p>
      ) : null}
      {outcome ? (
        <p role="status" style={{ margin: '8px 0 0', color: outcome.status === 'completed' ? 'var(--aiq-ok)' : 'var(--aiq-warn)' }}>
          {outcome.status === 'completed'
            ? `已改写 ${result.textSpans.length} 个片段。`
            : `部分完成：成功 ${result.textSpans.length - outcome.skipped.length}，跳过 ${outcome.skipped.length}。`}
          {outcome.undoable ? ' 可撤销。' : ''}
          {outcome.skipped.length > 0
            ? ` 跳过原因：${[...new Set(outcome.skipped.map((s) => s.reason))].join('；')}。`
            : ''}
        </p>
      ) : null}
      <div className="aiq-row" style={{ marginTop: 10 }}>
        <Button variant="primary" icon="text" disabled={busy} onClick={() => void apply()}>
          {busy ? '写入中……' : '批改这些片段'}
        </Button>
      </div>
      </Card>
      <ConvertOutlinesCard workspace={workspace} result={result} />
    </div>
  );
}

/** 转曲卡片：把当前结果中的文本容器转为轮廓路径。 */
function ConvertOutlinesCard({ workspace, result }: { workspace: Workspace; result: NonNullable<ReturnType<Workspace['currentResult']>> }) {
  const textObjects = result.request.target === 'objects'
    ? result.objects.filter((o) => o.kind === 'text-point' || o.kind === 'text-area' || o.kind === 'text-path')
    : [];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const convert = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await workspace.convertTextToOutlines(textObjects.map((o) => o.objectId));
      setMessage(
        outcome.status === 'completed'
          ? `已转曲 ${textObjects.length} 个文本对象。`
          : `部分完成：成功 ${textObjects.length - outcome.skipped.length}，跳过 ${outcome.skipped.length}。`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '转曲失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="转曲" icon="text">
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        当前结果中的文本容器 {textObjects.length} 个。转曲后文字变为路径（统计口径随之变化：文字片段消失、路径增加）。
        演示环境以字符边界矩形近似字形轮廓并如实标注；真实宿主为字形轮廓（未实机验证）。
      </p>
      {textObjects.length === 0 ? (
        <EmptyState>先用「查找」查询对象（类型勾选点文字/区域文字/路径文字）。</EmptyState>
      ) : (
        <Button variant="primary" icon="text" disabled={busy} onClick={() => void convert()}>
          {busy ? '转曲中……' : '转曲这些文本'}
        </Button>
      )}
      {message ? (
        <p role="status" style={{ margin: '8px 0 0' }}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}
