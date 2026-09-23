import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'text-write',
    title: '文字批改',
    description: '按所选文字框修改明确填写的字体、字号、填描，或批量转曲。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'text',
    requiredCapabilities: ['editorTools'],
    optionalCapabilities: [],
    commands: [],
    panelContributions: [
      { id: 'main', navTitle: '批改', icon: 'text', viewKind: 'module-view' },
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
import { EditorTextPanel as TextWriteViewComponent } from './EditorTextPanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: TextWriteViewComponent,
};
