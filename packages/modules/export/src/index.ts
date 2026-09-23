import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'export',
    title: '导出队列',
    description: '按对象或画板导出八种格式，一键打包 AI、字体、链接及附件。',
    version: '0.6.8',
    tools: [{id:'main',title:'文件导出',description:'按对象或画板导出八种格式',icon:'doc',viewId:'main'},{id:'package',title:'打包',description:'收集 AI、字体、链接及画板附件',icon:'doc',viewId:'package'}],
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'doc',
    requiredCapabilities: ['editorTools'],
    optionalCapabilities: [],
    commands: [],
    panelContributions: [
      { id: 'package', navTitle: '打包', icon: 'doc', viewKind: 'module-view' },
      { id: 'main', navTitle: '导出', icon: 'doc', viewKind: 'module-view' },
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
import { PackagePanel } from './PackagePanel.js';
import { EditorExportPanel as ExportViewComponent } from './EditorExportPanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: ExportViewComponent,
  package: PackagePanel,
};
