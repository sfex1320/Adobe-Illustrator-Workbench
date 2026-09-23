import { EditorSelectionPanel } from './EditorSelectionPanel';
import { useMemo, useState } from 'react';
import type { ObjectKind, QueryRequest, ToolContribution } from '@aiq/contracts';
import { OBJECT_KIND_LABELS } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { SAME_SHORTCUTS } from '@aiq/core';
import { Button, Card, Field, useEditor, EditorFeedback } from '@aiq/ui';

const ALL_KINDS: ObjectKind[] = [
  'path',
  'compound-path',
  'group',
  'text-point',
  'text-area',
  'text-path',
  'image',
  'symbol-instance',
  'unknown',
];

export function SelectionView({ workspace, tool }: { workspace: Workspace; tool?: ToolContribution }) {
  return workspace.getHostInfo().capabilities.editorTools?.supported?<EditorSelectionPanel workspace={workspace} tool={tool}/>:<LegacySelectionView workspace={workspace} tool={tool}/>;
}
function LegacySelectionView({workspace,tool}:{workspace:Workspace;tool?:ToolContribution}) {
  const editor=useEditor(workspace);
  const [target, setTarget] = useState<'objects' | 'text-spans'>(tool?.section==='text'?'text-spans':'objects');
  const [selectedKinds, setSelectedKinds] = useState<ObjectKind[]>(tool?.queryPreset?.objectsFilter?.kinds??[]);
  const [nameIncludes, setNameIncludes] = useState('');
  const [fontFamily, setFontFamily] = useState('');
  const [fontStyle, setFontStyle] = useState('');
  const [fontSize, setFontSize] = useState('');
  const [sizeTolerance, setSizeTolerance] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = workspace.currentSnapshot();
  const availableFamilies = useMemo(() => {
    const snap = snapshot;
    if (!snap) return [];
    return [...new Set(snap.textSpans.map((s) => s.style.fontFamily))].sort();
  }, [snapshot]);

  const toggleKind = (kind: ObjectKind) => {
    setSelectedKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  };

  const runQuery = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsedSize = fontSize.trim() === '' ? undefined : Number(fontSize);
      if (parsedSize !== undefined && !Number.isFinite(parsedSize)) {
        throw new Error('字号必须是数字（pt）');
      }
      const parsedTolerance = Number(sizeTolerance);
      const hasTextCondition =
        fontFamily.trim() !== '' || fontStyle.trim() !== '' || parsedSize !== undefined;

      const request: QueryRequest = {
        scope: workspace.currentScope(),
        target,
        objectsFilter: {
          kinds: selectedKinds.length > 0 ? selectedKinds : undefined,
          nameIncludes: nameIncludes.trim() === '' ? undefined : nameIncludes.trim(),
          textStyle:
            hasTextCondition || target === 'text-spans'
              ? {
                  fontFamily: fontFamily.trim() === '' ? undefined : fontFamily.trim(),
                  fontStyle: fontStyle.trim() === '' ? undefined : fontStyle.trim(),
                  fontSizePt: parsedSize,
                  fontSizeTolerancePt: Number.isFinite(parsedTolerance) ? parsedTolerance : 0,
                }
              : undefined,
        },
      };
      await workspace.resolveQuery(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setBusy(false);
    }
  };

  if(tool?.queryPreset) return <Card title={tool.title} icon={tool.icon} help={`${tool.description}。下方可查看结果，或切换“条件查找”设置更多条件。`}>{error&&<p role="alert" className="aiq-error-text">{error}</p>}<Button icon="refresh" disabled={busy} onClick={()=>void runQuery()}>重新查询</Button></Card>;

  return (
    <Card title="查找与选择" icon="select">
      <details className="wb-details" onToggle={event=>{if(event.currentTarget.open)void editor.read();}}><summary>选择相同 · 当前文档</summary><div className="wb-shortcut-actions">{SAME_SHORTCUTS.map(([command,label])=><Button key={command} disabled={editor.busy||!editor.state?.nativeCommands?.includes(command)} onClick={()=>void editor.act({type:'native',command})}>{label}</Button>)}</div><EditorFeedback error={editor.error} message={editor.message}/></details>
      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="aiq-row">
          <label className="aiq-switch">
            <input
              type="radio"
              name="query-target"
              checked={target === 'objects'}
              onChange={() => setTarget('objects')}
            />
            查找对象
          </label>
          <label className="aiq-switch">
            <input
              type="radio"
              name="query-target"
              checked={target === 'text-spans'}
              onChange={() => setTarget('text-spans')}
            />
            查找文字片段
          </label>
        </div>

        {target === 'objects' ? (
          <div>
            <Field label="对象类型">
              <div className="aiq-row" role="group" aria-label="对象类型">
                {ALL_KINDS.map((kind) => (
                  <label key={kind} className="aiq-switch">
                    <input
                      type="checkbox"
                      checked={selectedKinds.includes(kind)}
                      onChange={() => toggleKind(kind)}
                    />
                    {OBJECT_KIND_LABELS[kind]}
                  </label>
                ))}
              </div>
            </Field>
            <div style={{ marginTop: 6 }}>
              <Field label="名称包含">
                <input
                  className="aiq-input"
                  value={nameIncludes}
                  onChange={(e) => setNameIncludes(e.target.value)}
                  placeholder="例如：五角星"
                  aria-label="名称包含"
                />
              </Field>
            </div>
          </div>
        ) : null}

        {target==='text-spans'&&<div className="wb-form-grid">
          <Field label="字体家族" help="按样式查找片段，可定位整个文本框。原生非连续片段多选尚未支持。">
            <input
              className="aiq-input"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              list="aiq-font-families"
              placeholder="如：思源黑体"
              aria-label="字体家族"
            />
            <datalist id="aiq-font-families">
              {availableFamilies.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label="款式">
            <input
              className="aiq-input"
              value={fontStyle}
              onChange={(e) => setFontStyle(e.target.value)}
              placeholder="如：Bold、Regular"
              aria-label="字体款式"
            />
          </Field>
          <Field label="字号 pt">
            <input
              className="aiq-input"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              placeholder="如：12"
              aria-label="字号"
              style={{ width: 90 }}
            />
          </Field>
          <Field label="字号容差 ±pt">
            <input
              className="aiq-input"
              value={sizeTolerance}
              onChange={(e) => setSizeTolerance(e.target.value)}
              aria-label="字号容差"
              style={{ width: 70 }}
            />
          </Field>
        </div>}

        {error ? (
          <p className="aiq-error-text" role="alert">
            {error}
          </p>
        ) : null}

        <div className="aiq-row">
          <Button variant="primary" icon="search" onClick={() => void runQuery()} disabled={busy}>
            {busy ? '查询中……' : '执行查询'}
          </Button>
          <Button icon="close" onClick={() => workspace.clearResult()}>
            清空结果
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
