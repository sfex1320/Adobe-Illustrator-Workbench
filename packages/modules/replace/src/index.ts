import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'replace',
    title: '对象替换',
    description: '先记住一个或多个目标 A，再选择来源 B，批量复制替换并保留层级。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'swap',
    requiredCapabilities: ['editorTools'],
    optionalCapabilities: [],
    commands: [],
    panelContributions: [
      { id: 'main', navTitle: '替换', icon: 'swap', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    moduleDependencies: [],
    defaultEnabled: true,
  },
  implementation: {
    async onActivate() {
      // 视图组件自行管理状态；无全局监听。
    },
    async onDeactivate() {
      // 无需清理。
    },
    async runCommand() {
      // 本模块操作全部由视图表单驱动，无独立命令。
    },
  },
};

import type { ComponentType } from 'react';
import type { Workspace } from '@aiq/core';
import { EditorReplacePanel as ReplaceViewComponent } from './EditorReplacePanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: ReplaceViewComponent,
};
