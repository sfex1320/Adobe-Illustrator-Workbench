import type { HostCapabilities, ToolContribution } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import type { DiscoveredModule } from './module-discovery';

export const CAPABILITY_REASONS: Partial<Record<keyof HostCapabilities, string>> = {
  collectSnapshot: '无法读取文档。请确认 Illustrator 为 30.0.0，并重新连接。',
  transformObjects: '当前版本尚未提供可靠的对象尺寸与位置调整。',
  writeTextStyles: '文字批改尚未完成宿主验证，暂时不能改写稿件。',
  replaceObjects: '批量替换尚未完成层级保留与撤销验证。',
  writePathPoints: '实时对称的裁切、融合与取消恢复尚未完成。',
  exportFiles: '图片与 PDF 导出尚未完成源文件保护验证。',
};
export interface ToolGroup {
  id: string; title: string; icon: DiscoveredModule['bundle']['manifest']['icon'];
  tools: ToolContribution[]; available: boolean; enabled: boolean; canEnable: boolean; reason?: string;
}
const ORDER = ['artboards', 'selection', 'size-align', 'annotation', 'style-transfer', 'text-write', 'replace', 'symmetry', 'variable-data', 'export', 'statistics', 'preflight'];
export function toolCatalog(workspace: Workspace, discovered: DiscoveredModule[]): ToolGroup[] {
  return discovered.map(({ bundle }) => {
    const m = bundle.manifest;
    const missing = m.requiredCapabilities.find(key => !workspace.getHostInfo().capabilities[key]?.supported);
    const entry = workspace.registry.get(m.id);
    const available = workspace.registry.isActive(m.id);
    const enabled = workspace.getSettings().enabledModules[m.id] ?? m.defaultEnabled;
    return {
      id: m.id, title: m.title, icon: m.icon, available, enabled, canEnable: !missing,
      reason: !enabled ? '工具已关闭，可在设置中启用。' : available ? undefined : missing ? CAPABILITY_REASONS[missing] ?? `当前环境不支持“${m.title}”需要的操作。` : entry?.activationError?.message ?? '工具未能启动，请在设置中重新连接。',
      tools: m.tools ?? m.panelContributions.map(p => ({ id: p.id, title: m.title, description: m.description, icon: p.icon, viewId: p.id })),
    };
  }).sort((a, b) => (ORDER.indexOf(a.id) < 0 ? 99 : ORDER.indexOf(a.id)) - (ORDER.indexOf(b.id) < 0 ? 99 : ORDER.indexOf(b.id)));
}
