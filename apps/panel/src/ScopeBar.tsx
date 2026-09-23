import { useEffect, useState } from 'react';
import type { QueryScope, QueryScopeKind } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Switch } from '@aiq/ui';

const SCOPE_LABELS: Record<QueryScopeKind, string> = {
  document: '整个文件',
  artboard: '指定画板',
  layer: '指定图层',
  selection: '当前选区',
};

/** 统一范围条：范围形态 + 穿透与包含开关。 */
export function ScopeBar({ workspace }: { workspace: Workspace }) {
  const scope = workspace.currentScope();
  const [artboards, setArtboards] = useState<Array<{ id: string; name: string }>>([]);
  const [layerNames, setLayerNames] = useState<string[]>([]);

  useEffect(() => {
    // 从当前快照收集画板与图层选项（快照不存在时先保证一份）。
    let cancelled = false;
    void workspace
      .ensureSnapshot({ ...scope, kind: 'document' })
      .then((snap) => {
        if (cancelled) return;
        setArtboards(snap.artboards.map((a) => ({ id: a.id, name: a.name })));
        setLayerNames([...new Set(snap.objects.map((o) => o.hierarchicalPath[0]).filter((n): n is string => !!n))]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, workspace.getDocument()?.sessionId]);

  const apply = (patch: Partial<QueryScope>) => {
    workspace.applyScope({ ...scope, ...patch });
  };

  return (
    <div className="aiq-scopebar" role="region" aria-label="查询范围">
      <label className="aiq-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <span>范围</span>
        <select
          className="aiq-select"
          value={scope.kind}
          onChange={(e) => {
            const kind = e.target.value as QueryScopeKind;
            apply({ kind, artboardId: undefined, layerName: undefined });
          }}
          aria-label="查询范围"
        >
          {(Object.keys(SCOPE_LABELS) as QueryScopeKind[]).map((k) => (
            <option key={k} value={k}>
              {SCOPE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      {scope.kind === 'artboard' ? (
        <select
          className="aiq-select"
          value={scope.artboardId ?? ''}
          onChange={(e) => apply({ artboardId: e.target.value || undefined })}
          aria-label="选择画板"
        >
          <option value="">（请选择画板）</option>
          {artboards.map((ab) => (
            <option key={ab.id} value={ab.id}>
              {ab.name}
            </option>
          ))}
        </select>
      ) : null}

      {scope.kind === 'layer' ? (
        <select
          className="aiq-select"
          value={scope.layerName ?? ''}
          onChange={(e) => apply({ layerName: e.target.value || undefined })}
          aria-label="选择图层"
        >
          <option value="">（请选择图层）</option>
          {layerNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}

      <span style={{ flex: 1 }} />

      <Switch
        checked={scope.pierceGroups}
        onChange={(v) => apply({ pierceGroups: v })}
        label="穿透组"
      />
      <Switch
        checked={scope.pierceClipGroups}
        onChange={(v) => apply({ pierceClipGroups: v })}
        label="穿透剪切组"
      />
      <Switch
        checked={scope.includeMaskPaths}
        onChange={(v) => apply({ includeMaskPaths: v })}
        label="含蒙版路径"
      />
      <Switch
        checked={scope.includeHidden}
        onChange={(v) => apply({ includeHidden: v })}
        label="含隐藏"
      />
      <Switch
        checked={scope.includeLocked}
        onChange={(v) => apply({ includeLocked: v })}
        label="含锁定"
      />

      {scope.kind === 'artboard' && !scope.artboardId ? (
        <span className="aiq-error-text" role="alert">
          请选择具体画板
        </span>
      ) : null}
      {scope.kind === 'layer' && !scope.layerName ? (
        <span className="aiq-error-text" role="alert">
          请选择具体图层
        </span>
      ) : null}
    </div>
  );
}
