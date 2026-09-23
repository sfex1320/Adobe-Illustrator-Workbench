import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'size-align',
    title: '尺寸统一',
    description: '按统一宽高、等比缩放或参考对象批量调整对象尺寸（真实写入）。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'size',
    requiredCapabilities: ['transformObjects'],
    optionalCapabilities: [],
    commands: [],
    panelContributions: [
      { id: 'main', navTitle: '尺寸', icon: 'size', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    tools: [
      {id:'adjust',title:'尺寸与对齐',tabTitle:'对象',description:'对象缩放、对齐与分布',icon:'size',viewId:'main',homeOrder:70},{id:'layers',title:'图层管理',tabTitle:'图层',description:'移动设计、图层命名与颜色标记',icon:'modules',viewId:'layers'}],
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
import { SizePanel } from './SizePanel.js';
import { EditorSizePanel } from './EditorSizePanel.js';
import { LayerPanel } from './LayerPanel.js';
import { createElement } from 'react';
const SizeAlignViewComponent = ({workspace}:{workspace:Workspace}) => createElement(workspace.getHostInfo().capabilities.editorTools?.supported ? EditorSizePanel : SizePanel,{workspace});

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: SizeAlignViewComponent,
  layers: LayerPanel,
};
