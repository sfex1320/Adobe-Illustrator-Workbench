import type { ModuleBundle } from '@aiq/contracts';
import { MODULE_CONTRACT_VERSION } from '@aiq/contracts';

export const moduleBundle: ModuleBundle = {
  manifest: {
    id: 'selection',
    title: '查找与选择',
    description: '按类型、名称、字体款式字号查询；穿透组与剪切组；对象选择与文字片段定位。',
    version: '0.1.0',
    contractVersion: MODULE_CONTRACT_VERSION,
    icon: 'select',
    requiredCapabilities: ['collectSnapshot'],
    optionalCapabilities: ['selectObjects'],
    commands: [
      {
        id: 'select-result',
        title: '选择当前结果中的对象',
        description: '选择结果区中的对象目标（受限对象跳过，不解锁不取消隐藏）',
        icon: 'check',
      },
      {
        id: 'locate-containers',
        title: '定位文字片段所在文本框',
        description: '选中片段结果所在的文本容器对象（明确标注：这是整框定位，不是片段选择）',
        icon: 'doc',
      },
      { id: 'clear-result', title: '清空查询结果', icon: 'close' },
    ],
    panelContributions: [
      { id: 'main', navTitle: '查找', icon: 'select', viewKind: 'module-view' },
    ],
    settingsVersion: 1,
    tools: [
      { id: 'query', title: '条件筛选', description: '相同颜色、类型、尺寸和字体条件组合', icon: 'search', viewId: 'main', homeOrder: 10 },
      { id: 'text', title: '文字查找', description: '按内容和样式查找、逐项定位或替换', icon: 'text', viewId: 'main' },
      { id: 'style', title: '字体样式替换', description: '组合查找字体、款式、字号与填色，仅替换命中字符的指定样式', icon: 'text', viewId: 'main', section: 'text' },
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
    async runCommand(commandId, ctx) {
      if (commandId === 'select-result') {
        await ctx.selection.selectCurrentResult();
      } else if (commandId === 'locate-containers') {
        await ctx.selection.locateContainersOfCurrentResult();
      } else if (commandId === 'clear-result') {
        ctx.query.clearResult();
      }
    },
  },
};

export { SelectionView } from './SelectionView.js';

import type { ComponentType } from 'react';
import type { Workspace } from '@aiq/core';
import { SelectionView as SelectionViewComponent } from './SelectionView.js';

/** 面板贡献视图注册：viewId → 组件。 */
export const moduleViews: Record<string, ComponentType<{ workspace: Workspace }>> = {
  main: SelectionViewComponent,
};
