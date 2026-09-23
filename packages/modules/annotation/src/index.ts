import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'annotation',
    title: '标注工具',
    description: '画板规格、对象尺寸、间隙与曲线标注',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'size',
    requiredCapabilities: ['editorTools'],
    optionalCapabilities: [],
    commands: [],
    panelContributions: [
      { id: 'main', navTitle: '标注', icon: 'size', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    tools: [
      {id:'annotations',title:'尺寸标注',tabTitle:'标注',description:'画板规格、对象尺寸、间隙与曲线标注',icon:'size',viewId:'main',homeOrder:75},
    ],
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
import { AnnotationPanel } from './AnnotationPanel.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: AnnotationPanel,
};
