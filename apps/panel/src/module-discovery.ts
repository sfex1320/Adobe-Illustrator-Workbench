/// <reference types="vite/client" />
import type { ComponentType } from 'react';
import type { ModuleBundle, ToolContribution } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';

export interface ModuleViewProps {
  workspace: Workspace;
  tool?: ToolContribution;
}

export interface DiscoveredModule {
  bundle: ModuleBundle;
  views: Record<string, ComponentType<ModuleViewProps>>;
}

/**
 * 构建时模块发现：自动扫描 packages/modules 下每个模块包的 src/index.ts。
 * 新增功能包只需在该目录创建包并导出 moduleBundle 与 moduleViews，
 * 主面板导航与命令搜索自动纳入，无需修改本文件（M01）。
 */
const loaders = import.meta.glob('../../../packages/modules/*/src/index.ts') as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

export async function discoverModules(): Promise<DiscoveredModule[]> {
  const discovered: DiscoveredModule[] = [];
  for (const [path, load] of Object.entries(loaders)) {
    try {
      const mod = await load();
      const bundle = mod.moduleBundle as ModuleBundle | undefined;
      if (bundle && bundle.manifest.id !== 'symmetry') {
        const views = (mod.moduleViews ?? {}) as Record<string, ComponentType<ModuleViewProps>>;
        discovered.push({ bundle, views });
      }
    } catch (e) {
      // 单个模块加载失败不阻止壳层启动（M04）。
      console.warn(`[aiq-panel] 模块加载失败：${path}`, e);
    }
  }
  return discovered;
}
