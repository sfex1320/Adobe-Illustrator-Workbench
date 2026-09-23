import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'symmetry',
    title: '对称整理',
    description:
      '凸直线闭合路径的实时单侧对称预览、接缝融合、保留及取消恢复。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'mirror',
    requiredCapabilities: ['editorTools'],
    optionalCapabilities: ['readPathPoints'],
    commands: [],
    panelContributions: [
      { id: 'main', navTitle: '对称', icon: 'mirror', viewKind: 'module-view' },
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
import { EditorSymmetryPanel as SymmetryViewComponent } from './EditorSymmetryPanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: SymmetryViewComponent,
};
