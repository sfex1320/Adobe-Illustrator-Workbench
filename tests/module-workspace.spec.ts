/**
 * 模块机制必测案例 M01–M04 与工作区行为（B03 失效、A04 选择受限跳过、设置损坏回退、快照缓存）。
 */

import { describe, expect, it, vi } from 'vitest';
import type { ModuleBundle } from '@aiq/contracts';
import { DEFAULT_APP_SETTINGS, DEFAULT_QUERY_SCOPE, MODULE_CONTRACT_VERSION } from '@aiq/contracts';
import { Workspace } from '@aiq/core';
import { DemoHostAdapter } from '@aiq/host-adapter';

function makeTestModule(overrides: Partial<ModuleBundle['manifest']> = {}): ModuleBundle {
  return {
    manifest: {
      id: 'test-module',
      title: '测试模块',
      description: '仅用于测试',
      version: '0.1.0',
      contractVersion: MODULE_CONTRACT_VERSION,
      icon: 'info',
      requiredCapabilities: [],
      optionalCapabilities: [],
      commands: [],
      panelContributions: [
        { id: 'main', navTitle: '测试', icon: 'info', viewKind: 'module-view' },
      ],
      settingsVersion: 1,
      moduleDependencies: [],
      defaultEnabled: true,
      ...overrides,
    },
    implementation: {
      onActivate: vi.fn(async () => undefined),
      onDeactivate: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => undefined),
    },
  };
}

function makeWorkspace(): { workspace: Workspace; adapter: DemoHostAdapter } {  const adapter = new DemoHostAdapter();
  const workspace = new Workspace({
    adapter,
    settingsStore: {
      load: () => ({ ...DEFAULT_APP_SETTINGS, enabledModules: {}, scopePreference: { ...DEFAULT_APP_SETTINGS.scopePreference } }),
      save: () => undefined,
    },
  });
  return { workspace, adapter };
}

describe('M01–M04 模块机制', () => {
  it('启动和重新连接保留用户关闭的工具', async () => {
    const workspace = new Workspace({adapter:new DemoHostAdapter(),settingsStore:{load:()=>({...DEFAULT_APP_SETTINGS,enabledModules:{'test-module':false}}),save:()=>undefined}});
    const bundle = makeTestModule();workspace.registerModule(bundle);
    await workspace.initialize();await workspace.activateAvailableModules();
    expect(workspace.registry.isActive('test-module')).toBe(false);
    await workspace.activateAvailableModules();
    expect(bundle.implementation.onActivate).not.toHaveBeenCalled();
    await expect(workspace.runModuleCommand('test-module.action')).rejects.toMatchObject({code:'MODULE_NOT_ACTIVE'});
    await workspace.activateModule('test-module');
    expect(workspace.getSettings().enabledModules['test-module']).toBe(true);
    await workspace.deactivateModule('test-module');
    expect(workspace.registry.get('test-module')?.state).toBe('disabled');
    await workspace.activateAvailableModules();
    expect(workspace.registry.isActive('test-module')).toBe(false);
    expect(bundle.implementation.onDeactivate).toHaveBeenCalledOnce();
    expect(bundle.implementation.onActivate).toHaveBeenCalledOnce();
  });
  it('能力不足不反复激活，也不阻断其他工具', async () => {
    const {workspace}=makeWorkspace();
    const blocked=makeTestModule({id:'blocked',requiredCapabilities:['documentChangeEvents']});
    workspace.registerModule(blocked);workspace.registerModule(makeTestModule({id:'ready'}));
    await workspace.initialize();await workspace.activateAvailableModules();
    expect(workspace.registry.isActive('ready')).toBe(true);
    expect(workspace.registry.isActive('blocked')).toBe(false);
    expect(blocked.implementation.onActivate).not.toHaveBeenCalled();
  });
  it('M02 重复 ID 被拒绝并说明原因', () => {
    const { workspace } = makeWorkspace();
    const a = makeTestModule();
    const b = makeTestModule();
    workspace.registerModule(a);
    workspace.registerModule(b); // 相同 id
    expect(workspace.registry.list()).toHaveLength(1);
    // 直接在 registry 层验证错误码。
    const result = workspace.registry.register(b);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('MODULE_DUPLICATE_ID');
  });

  it('M02 契约版本不兼容被拒绝', () => {
    const { workspace } = makeWorkspace();
    const bad = makeTestModule({ contractVersion: 99 as never });
    const result = workspace.registry.register(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('MODULE_CONTRACT_MISMATCH');
  });

  it('M02 模块间依赖被显式拒绝（首版不支持）', () => {
    const { workspace } = makeWorkspace();
    const dependent = makeTestModule({ moduleDependencies: ['selection'] });
    const result = workspace.registry.register(dependent);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('MODULE_DEPENDENCY_NOT_ALLOWED');
  });

  it('M02 缺少必需宿主能力时激活被拒绝', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const module = makeTestModule({ requiredCapabilities: ['documentChangeEvents'] });
    workspace.registry.register(module);
    await expect(workspace.activateModule('test-module')).rejects.toMatchObject({
      code: 'MODULE_MISSING_CAPABILITY',
    });
    expect(workspace.registry.get('test-module')?.state).toBe('error');
  });

  it('M03 反复启停无重复监听、无重复激活副作用', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const bundle = makeTestModule();
    workspace.registry.register(bundle);

    let listenerCount = 0;
    const ctx = workspace.createModuleContext('test-module');
    const off = ctx.scope.onChange(() => {
      listenerCount += 1;
    });

    for (let i = 0; i < 3; i += 1) {
      await workspace.activateModule('test-module');
      await workspace.deactivateModule('test-module');
    }
    expect(bundle.implementation.onActivate).toHaveBeenCalledTimes(3);
    expect(bundle.implementation.onDeactivate).toHaveBeenCalledTimes(3);
    expect(workspace.registry.get('test-module')?.state).not.toBe('active');

    off();
    // 事件总线监听器计数不再变化（重复 off 是安全的 no-op，无泄漏）。
    const before = workspace.events.listenerCount();
    off();
    expect(workspace.events.listenerCount()).toBe(before);
    expect(listenerCount).toBe(0);
  });

  it('M04 某模块激活失败不影响其他模块与壳层', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();

    const broken = makeTestModule({ id: 'broken-module', title: '坏模块' });
    broken.implementation.onActivate = vi.fn(async () => {
      throw new Error('激活崩溃');
    });
    const healthy = makeTestModule({ id: 'healthy-module', title: '好模块' });

    workspace.registry.register(broken);
    workspace.registry.register(healthy);

    const failures = [];
    // 逐个激活：broken 失败，healthy 成功。
    try {
      await workspace.activateModule('broken-module');
    } catch {
      failures.push('broken-module');
    }
    await workspace.activateModule('healthy-module');

    expect(failures).toEqual(['broken-module']);
    expect(workspace.registry.get('broken-module')?.state).toBe('error');
    expect(workspace.registry.get('broken-module')?.activationError?.message).toContain('激活失败');
    expect(workspace.registry.isActive('healthy-module')).toBe(true);
    // 壳层仍可查询（不依赖失败模块）。
    const result = await workspace.resolveQuery({ scope: { ...DEFAULT_QUERY_SCOPE }, target: 'objects' });
    expect(result.objects.length).toBeGreaterThan(0);
  });

  it('命令列表由模块贡献生成（含全局 ID）', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const module = makeTestModule({
      commands: [{ id: 'do-thing', title: '做一件事' }],
    });
    workspace.registry.register(module);
    const commands = workspace.registry.allCommands();
    expect(commands.map((c) => c.globalId)).toContain('test-module.do-thing');
  });
});

describe('工作区：引用失效与受限选择', () => {
  it('B03 查询后切换文档：旧结果选择被拒绝（DOC_SESSION_MISMATCH）', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({ scope: { ...DEFAULT_QUERY_SCOPE }, target: 'objects' });
    expect(workspace.currentResult()?.docSessionId).toBe('demo-doc-a');

    await workspace.switchDocument('demo-doc-b');
    await expect(workspace.selectFromCurrentResult('objects')).rejects.toMatchObject({
      code: 'DOC_SESSION_MISMATCH',
    });
  });

  it('B03 查询后外部编辑：宿主端校验采集标记，旧引用过期（REF_STALE）', async () => {
    const { workspace, adapter } = makeWorkspace();
    await workspace.initialize();
    await workspace.resolveQuery({ scope: { ...DEFAULT_QUERY_SCOPE }, target: 'objects' });

    adapter.simulateExternalEdit();
    await expect(workspace.selectFromCurrentResult('objects')).rejects.toMatchObject({
      code: 'REF_STALE',
    });
  });

  it('A04 选择动作跳过隐藏/锁定目标，不自动解锁或取消隐藏', async () => {
    const { workspace, adapter } = makeWorkspace();
    await workspace.initialize();
    const scope = { ...DEFAULT_QUERY_SCOPE, includeHidden: true, includeLocked: true };
    await workspace.resolveQuery({ scope, target: 'objects' });
    expect(workspace.currentResult()?.objects.map((o) => o.objectId)).toContain('hidden-note');

    const command = await workspace.selectFromCurrentResult('objects');
    expect(command.status).toBe('partial');
    expect(command.selectedObjectIds).not.toContain('hidden-note');
    expect(command.selectedObjectIds).not.toContain('locked-bg');
    const skippedIds = command.skipped.map((s) => s.objectId);
    expect(skippedIds).toContain('hidden-note');
    expect(skippedIds).toContain('locked-bg');
    expect(command.skipped.map((s) => s.reason).join()).toContain('不自动');
    // 演示宿主中对象仍是隐藏/锁定状态（未被暗中修改）。
    expect(adapter.getSelectionIds()).not.toContain('hidden-note');
  });

  it('快照按范围缓存；强制刷新更换采集标记', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const scope = { ...DEFAULT_QUERY_SCOPE };
    const first = await workspace.ensureSnapshot(scope);
    const cached = await workspace.ensureSnapshot(scope);
    expect(cached.collectionStamp).toBe(first.collectionStamp);
    const fresh = await workspace.ensureSnapshot(scope, { forceRefresh: true });
    expect(fresh.collectionStamp).not.toBe(first.collectionStamp);
  });

  it('设置损坏时回退默认值并在初始化时提示', async () => {
    let corrupted = false;
    const adapter = new DemoHostAdapter();
    const workspace = new Workspace({
      adapter,
      settingsStore: {
        load: () => {
          throw new Error('损坏');
        },
        save: () => undefined,
      },
    });
    workspace.events.on('settings-corrupted', () => {
      corrupted = true;
    });
    // 构造后即回退默认值（可解释默认，不阻塞）。
    expect(workspace.getSettings().theme).toBe('follow');
    expect(corrupted).toBe(false);
    await workspace.initialize();
    expect(corrupted).toBe(true);
  });

  it('空选区范围经工作区查询返回空结果', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const result = await workspace.resolveQuery({
      scope: { ...DEFAULT_QUERY_SCOPE, kind: 'selection' },
      target: 'objects',
    });
    expect(result.objects).toHaveLength(0);
    expect(result.dedupedTargetCount).toBe(0);
  });

  it('B02 连续刷新：旧请求不覆盖新结果', async () => {
    const { workspace } = makeWorkspace();
    await workspace.initialize();
    const first = workspace.resolveQuery({
      scope: { ...DEFAULT_QUERY_SCOPE },
      target: 'objects',
      objectsFilter: { nameIncludes: '五角星' },
    });
    const second = workspace.resolveQuery({
      scope: { ...DEFAULT_QUERY_SCOPE },
      target: 'objects',
      objectsFilter: { nameIncludes: '圆点' },
    });
    await first;
    await second;
    // 最终结果属于最后一次请求。
    expect(workspace.currentResult()?.objects.map((o) => o.objectId)).toEqual(['dot-1']);
  });
});
