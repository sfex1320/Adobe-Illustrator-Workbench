import type { Workspace } from '@aiq/core';
import { Badge, Button, Card } from '@aiq/ui';

const STATE_LABELS: Record<string, string> = {
  registered: '已注册',
  active: '已启用',
  error: '错误',
  disabled: '已停用',
};

/** 模块管理：启停、状态与错误说明。未实现的长期方向只在文档中，不在面板伪造入口。 */
export function ModulesView({
  workspace,
  onActionError,
}: {
  workspace: Workspace;
  onActionError: (message: string) => void;
}) {
  const entries = workspace.registry.list();

  const toggle = async (moduleId: string, enable: boolean) => {
    try {
      if (enable) {
        await workspace.activateModule(moduleId);
      } else {
        await workspace.deactivateModule(moduleId);
      }
    } catch (e) {
      onActionError(e instanceof Error ? e.message : '模块操作失败');
    }
  };

  return (
    <Card title="模块管理" icon="modules">
      <p style={{ margin: '0 0 10px', color: 'var(--aiq-text-muted)' }}>
        已实现的模块在此启停；停用后其视图与命令从面板移除。实时对称、正文批改、转曲、导出等属于后续阶段，
        不以占位按钮出现在面板中（见 docs/03-任务书）。
      </p>
      <ul className="aiq-stat-list">
        {entries.map((entry) => (
          <li key={entry.manifest.id} className="aiq-result-item">
            <Badge
              tone={entry.state === 'active' ? 'ok' : entry.state === 'error' ? 'danger' : undefined}
            >
              {STATE_LABELS[entry.state] ?? entry.state}
            </Badge>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>
                <strong>{entry.manifest.title}</strong>
                <span className="aiq-stat-value"> v{entry.manifest.version}</span>
              </div>
              <div className="aiq-path">{entry.manifest.description}</div>
              {entry.activationError ? (
                <div className="aiq-error-text">{entry.activationError.message}</div>
              ) : null}
            </div>
            <Button onClick={() => void toggle(entry.manifest.id, entry.state !== 'active')}>
              {entry.state === 'active' ? '停用' : '启用'}
            </Button>
          </li>
        ))}
      </ul>
      {entries.length === 0 ? <p className="aiq-empty">没有发现模块</p> : null}
    </Card>
  );
}
