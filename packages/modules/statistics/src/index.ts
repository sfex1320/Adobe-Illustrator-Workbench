import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'statistics',
    title: '文档统计',
    description: '字体、字号、颜色与渐变的只读统计；条目可发起查询定位。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'stats',
    requiredCapabilities: ['collectSnapshot'],
    optionalCapabilities: ['readArtboards'],
    commands: [
      {
        id: 'refresh',
        title: '刷新统计',
        description: '强制重新采集当前范围的快照并重新统计',
        icon: 'refresh',
      },
    ],
    panelContributions: [
      { id: 'main', navTitle: '统计', icon: 'stats', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    tools: [
      { id: 'fonts', title: '字体统计', description: '字体、款式与字号分布', icon: 'text', viewId: 'main', section: 'fonts', homeOrder: 30 },
      { id: 'colors', title: '颜色统计', description: '查看使用颜色与色板', icon: 'theme', viewId: 'main', section: 'colors', homeOrder: 40 },
      { id: 'gradients', title: '渐变统计', description: '查找相同渐变配方', icon: 'stats', viewId: 'main', section: 'gradients', homeOrder: 50 },
    ],
    moduleDependencies: [],
    defaultEnabled: true,
  },
  implementation: {
    async onActivate() {
      // 统计视图组件自行订阅范围与文档事件；激活本身不注册全局监听。
    },
    async onDeactivate() {
      // 无全局监听需要清理。
    },
    async runCommand(commandId, ctx) {
      if (commandId === 'refresh') {
        await ctx.snapshots.ensureSnapshot(ctx.scope.current(), { forceRefresh: true });
      }
    },
  },
};

export { StatisticsView } from './StatisticsView.js';
export * from './compute.js';

import type { ComponentType } from 'react';
import type { Workspace } from '@aiq/core';
import { StatisticsPanel as StatisticsViewComponent } from './StatisticsPanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: StatisticsViewComponent,
};
