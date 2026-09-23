import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card, EmptyState } from '@aiq/ui';
import { runPreflight } from './compute.js';
import type { PreflightIssue } from './compute.js';

const LEVEL_LABELS: Record<PreflightIssue['level'], { label: string; tone: 'danger' | 'demo' | 'ok' | undefined }> = {
  error: { label: '错误', tone: 'danger' },
  warning: { label: '警告', tone: 'demo' },
  info: { label: '提示', tone: undefined },
  unchecked: { label: '无法检查', tone: undefined },
};

/** 印前检查视图：规则结果 + 点击定位（发起查询）。 */
export function PreflightView({ workspace }: { workspace: Workspace }) {
  const [issues, setIssues] = useState<PreflightIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const scope = {
          ...workspace.currentScope(),
          kind: 'document' as const,
          includeHidden: true,
          includeLocked: true,
          pierceGroups: true,
          pierceClipGroups: true,
          includeMaskPaths: true,
        };
        const snapshot = await workspace.ensureSnapshot(scope, { forceRefresh,readOnly:true });
        setIssues(runPreflight(snapshot));
      } catch (e) {
        setIssues(null);
        setError(e instanceof Error ? e.message : '检查失败');
      } finally {
        setLoading(false);
      }
    },
    [workspace],
  );

  useEffect(() => {
    void load(false);
    const off = workspace.events.on('document-changed', () => setIssues(null));
    return () => {
      off();
    };
  }, [workspace, load]);

  return (
    <Card
      title={
        <>
          印前检查
          <Button
            icon="refresh"
            disabled={loading}
            onClick={() => void load(true)}
            style={{ marginLeft: 'auto' }}
          >
            重新检查
          </Button>
        </>
      }
      icon="check"
    >
      <p style={{ margin: '0 0 8px', color: 'var(--aiq-text-muted)' }}>
        检查整个文档的已支持项目；未覆盖项单独列出。
      </p>
      {error ? (
        <p className="aiq-error-text" role="alert">
          {error}
        </p>
      ) : null}
      {!issues ? (
        <EmptyState>{loading ? '检查中……' : '暂无结果'}</EmptyState>
      ) : issues.length === 0 ? (
        <EmptyState>未发现问题（按当前规则与快照覆盖范围）。</EmptyState>
      ) : (
        <ul className="aiq-stat-list wb-preflight-results">
          {issues.map((issue) => (
            <li key={issue.rule} className="aiq-result-item">
              <Badge tone={LEVEL_LABELS[issue.level].tone}>{LEVEL_LABELS[issue.level].label}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{issue.message}</div>
              </div>
              {issue.locateQuery ? (
                <Button
                  icon="search"
                  onClick={() => {
                    void workspace.resolveQuery(issue.locateQuery!).catch(() => undefined);
                  }}
                >
                  定位
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
