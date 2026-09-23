import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'preflight',
    title: '印前检查',
    description: '基于快照的只读检查：未转曲文字、RGB 印刷色、专色、未使用色板、隐藏锁定对象；无法检查项如实单列。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'check',
    requiredCapabilities: ['collectSnapshot'],
    optionalCapabilities: [],
    commands: [
      {
        id: 'rerun',
        title: '重新执行印前检查',
        description: '强制刷新快照并重新检查',
        icon: 'refresh',
      },
    ],
    panelContributions: [
      { id: 'main', navTitle: '印前', icon: 'check', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    tools: [{ id: 'check', title: '印前检查', description: '检查已支持的印前项目', icon: 'check', viewId: 'main', homeOrder: 60 }],
    moduleDependencies: [],
    defaultEnabled: true,
  },
  implementation: {
    async onActivate() {
      // 视图组件自行订阅文档事件；无全局监听。
    },
    async onDeactivate() {
      // 无需清理。
    },
    async runCommand(commandId, ctx) {
      if (commandId === 'rerun') {
        await ctx.snapshots.ensureSnapshot(
          { ...ctx.scope.current(), kind: 'document', includeHidden: true, includeLocked: true, pierceGroups: true, pierceClipGroups: true, includeMaskPaths: true },
          { forceRefresh: true },
        );
      }
    },
  },
};

export * from './compute.js';

import type { ComponentType } from 'react';
import type { Workspace } from '@aiq/core';
import { PreflightView as PreflightViewComponent } from './PreflightView.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: PreflightViewComponent,
};
