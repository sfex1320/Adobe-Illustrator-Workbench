// @vitest-environment jsdom
/**
 * 界面与交互测试：U01（宽度适配的静态断言）、U02（主题与条件保留）、
 * U03（空态/演示徽标）、U04（键盘操作）与 M01（模块自动发现生成导航）。
 * jsdom 不做真实布局，U01 的像素级验证由截图与人工核对补充（见 docs/IMPLEMENTATION-STATUS.md）。
 */

import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_APP_SETTINGS } from '@aiq/contracts';
import { Workspace } from '@aiq/core';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { PanelApp } from '../src/App';
import { discoverModules } from '../src/module-discovery';
import { LocalSettingsStore } from '../src/storage';

async function setup() {
  localStorage.clear();
  const adapter = new DemoHostAdapter();
  const workspace = new Workspace({
    adapter,
    settingsStore: new LocalSettingsStore(),
  });
  const discovered = await discoverModules();
  for (const mod of discovered) workspace.registerModule(mod.bundle);
  await workspace.initialize();
  await workspace.activateAvailableModules();

  const demoExtensions = {
    addToSelection: (ids: string[]) => adapter.addToSelection(ids),
    clearSelection: () => adapter.setSelection([]),
    currentSelectionIds: () => adapter.getSelectionIds(),
    simulateExternalEdit: () => adapter.simulateExternalEdit(),
    listSessions: async () => (await adapter.listDocuments()).map((d) => ({ sessionId: d.sessionId, name: d.name })),
  };
  return { workspace, discovered, demoExtensions, adapter };
}

beforeAll(() => {
  // jsdom 无 matchMedia：ThemeProvider 需要它。
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
});

describe('M01 模块自动发现与导航生成', () => {
  it('统计与选择模块自动接入，导航不手写', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    expect(discovered.map((d) => d.bundle.manifest.id).sort()).toEqual([
      'annotation',
      'artboards',
      'export',
      'preflight',
      'productivity',
      'replace',
      'selection',
      'size-align',
      'statistics',
      'text-write',
      'variable-data',
    ]);

    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);
    const nav=within(screen.getByRole('navigation',{name:'工具栏'}));
    for (const label of ['画板管理','文档统计','查找选择', '文字处理', '尺寸对齐', '批量替换', '文件导出', '印前检查']) {
      expect(nav.getByRole('button', { name: new RegExp('^'+label) })).toBeTruthy();
    }
  });
});

describe('U03 演示徽标、空态与文档信息', () => {
  it('演示模式常显；主页展示快捷操作而非空结果占位', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    expect(await screen.findByText('演示模式')).toBeTruthy();
    expect(screen.queryByText(/画册封面（演示）/)).toBeNull();
    expect(screen.queryByText(/暂无查询结果/)).toBeNull();
    expect(screen.getByRole('button',{name:/^条件筛选/})).toBeTruthy();
  });
});

describe('U02 主题切换与查询条件保留', () => {
  it('切换主题改变 data-theme，不清空查询结果', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    // 先执行一次查询。
    await act(async () => {
      await workspace.resolveQuery({
        scope: { ...DEFAULT_APP_SETTINGS.scopePreference, pierceGroups: true, pierceClipGroups: true },
        target: 'objects',
        objectsFilter: { nameIncludes: '五角星' },
      });
    });
    const requestId=workspace.currentResult()?.requestId;
    fireEvent.click(screen.getByRole('button',{name:'设置'}));
    fireEvent.click(screen.getByRole('button',{name:'深色'}));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button',{name:'浅色'}));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // 主题切换后结果仍在。
    expect(workspace.currentResult()?.requestId).toBe(requestId);
    fireEvent.click(screen.getByRole('button',{name:'查找选择'}));
    expect(await screen.findByText(/对象 × 3/)).toBeTruthy();
  });
});

describe('U04 键盘操作', () => {
  it('Ctrl+K 打开命令搜索，Escape 关闭，Enter 执行第一个匹配', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: '命令搜索' });
    expect(dialog).toBeTruthy();
    const input = screen.getByLabelText('搜索命令') as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // Enter 打开设置；不再暴露模块启停流程。
    await userEvent.type(input, '设置');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy();
    });

    // 再次打开后 Escape 关闭。
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input2 = await screen.findByLabelText('搜索命令');
    fireEvent.keyDown(input2, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '命令搜索' })).toBeNull();
    });
  });
});

describe('浏览器交互：范围变化、统计联动选择、模块启停', () => {
  it('范围切换到空选区：查询返回空结果且界面如实显示', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    const findTab = await screen.findByRole('button', { name: '查找选择' });
    fireEvent.click(findTab);
    fireEvent.click(screen.getByRole('button',{name:'选区'}));
    const runButton = await screen.findByRole('button', { name: /执行查询/ });
    fireEvent.click(runButton);
    await waitFor(() => {
      expect(screen.getByText(/对象 × 0/)).toBeTruthy();
    });
  });

  it('统计条目点击后直接定位文本框并保留片段查询', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    // 先进入统计模块视图（默认在概览页）。
    const statsTab = await screen.findByRole('button', { name: '文档统计' });
    fireEvent.click(statsTab);
    await screen.findByText('字体家族');
    const pt12Button = await screen.findByRole('button', { name: /^12 pt/ });
    fireEvent.click(pt12Button);
    await waitFor(() => {
      expect(screen.getByText(/已定位 1 个对象/)).toBeTruthy();
      expect(workspace.currentResult()?.textSpans).toHaveLength(2);
      expect(screen.getByRole('button',{name:'选择全部匹配'})).toBeTruthy();
    });
  });

  it('关闭工具阻止导航和搜索命令，重新连接与重建工作区保留关闭，显式启用后恢复', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getAllByText('可用')).toHaveLength(discovered.filter(d=>workspace.registry.isActive(d.bundle.manifest.id)).length);
    expect(screen.getAllByText('暂不可用')).toHaveLength(discovered.filter(d=>!workspace.registry.isActive(d.bundle.manifest.id)).length); // Native editor tools do not claim a simulated implementation.
    expect(workspace.registry.isActive('statistics')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'关闭文档统计'}));
    await waitFor(()=>expect(workspace.registry.isActive('statistics')).toBe(false));
    const nav=within(screen.getByRole('navigation',{name:'工具栏'}));
    expect((nav.getByRole('button',{name:'文档统计'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window,{key:'k',ctrlKey:true});
    expect(within(screen.getByRole('dialog')).queryByText(/文档统计：/)).toBeNull();
    fireEvent.keyDown(screen.getByLabelText('搜索命令'),{key:'Escape'});
    fireEvent.click(screen.getByRole('button',{name:'重新连接'}));
    await waitFor(()=>expect((screen.getByRole('button',{name:'启用文档统计'}) as HTMLButtonElement).disabled).toBe(false));
    expect(workspace.registry.isActive('statistics')).toBe(false);
    const fresh=new Workspace({adapter:new DemoHostAdapter(),settingsStore:new LocalSettingsStore()});
    fresh.registerModule(discovered.find(d=>d.bundle.manifest.id==='statistics')!.bundle);
    await fresh.initialize();await fresh.activateAvailableModules();
    expect(fresh.registry.isActive('statistics')).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'启用文档统计'}));
    await waitFor(()=>expect(workspace.registry.isActive('statistics')).toBe(true));
    expect((nav.getByRole('button',{name:'文档统计'}) as HTMLButtonElement).disabled).toBe(false);
  });

  it('选择操作后显示部分完成结果（受限跳过说明）', async () => {
    const { workspace, discovered, demoExtensions } = await setup();
    render(<PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} />);
    fireEvent.click(screen.getByRole('button',{name:'查找选择'}));

    await act(async () => {
      await workspace.resolveQuery({
        scope: { ...DEFAULT_APP_SETTINGS.scopePreference, pierceGroups: true, pierceClipGroups: true, includeHidden: true, includeLocked: true },
        target: 'objects',
      });
    });
    const selectButton = await screen.findByRole('button', { name: /选择这些对象/ });
    fireEvent.click(selectButton);
    await waitFor(() => {
      expect(screen.getByText(/部分完成/)).toBeTruthy();
      expect(screen.getByText(/不自动取消隐藏|不自动解锁/)).toBeTruthy();
    });
  });
});
