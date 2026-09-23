/**
 * 模块注册表：注册时做契约检查（重复 ID、契约版本、能力依赖、模块间依赖），
 * 支持按需激活与停用释放。首版显式拒绝模块间依赖，而不是悄悄忽略。
 */

import {
  CoreError,
  MODULE_CONTRACT_VERSION,
} from '@aiq/contracts';
import type {
  CoreErrorInfo,
  HostCapabilities,
  ModuleBundle,
  ModuleContext,
  ModuleManifest,
  ModuleRegistrationResult,
} from '@aiq/contracts';

export type ModuleState = 'registered' | 'active' | 'error' | 'disabled';

export interface ModuleEntry {
  manifest: ModuleManifest;
  bundle: ModuleBundle;
  state: ModuleState;
  /** 启用偏好（来自设置）；缺省用 manifest.defaultEnabled。 */
  preferredEnabled: boolean;
  activationError?: CoreErrorInfo;
}

export interface CommandEntry {
  globalId: string;
  moduleId: string;
  moduleTitle: string;
  commandId: string;
  title: string;
  description?: string;
  icon?: ModuleManifest['icon'];
}

export type ModuleContextFactory = (moduleId: string) => ModuleContext;

export class ModuleRegistry {
  private modules = new Map<string, ModuleEntry>();

  register(bundle: ModuleBundle, preferredEnabled?: boolean): ModuleRegistrationResult {
    const errors: CoreErrorInfo[] = [];
    const manifest = bundle?.manifest;

    if (!manifest || typeof manifest.id !== 'string' || manifest.id.length === 0) {
      errors.push({
        code: 'MODULE_INVALID_MANIFEST',
        message: '模块清单无效：缺少 id',
      });
      return { ok: false, moduleId: '(unknown)', errors };
    }
    if (manifest.contractVersion !== MODULE_CONTRACT_VERSION) {
      errors.push({
        code: 'MODULE_CONTRACT_MISMATCH',
        message: `模块 ${manifest.id} 契约版本不兼容`,
        detail: `期望 ${MODULE_CONTRACT_VERSION}，实际 ${String(manifest.contractVersion)}`,
      });
    }
    if (this.modules.has(manifest.id)) {
      errors.push({
        code: 'MODULE_DUPLICATE_ID',
        message: `模块 ID 重复：${manifest.id}`,
      });
    }
    if (manifest.moduleDependencies !== undefined && manifest.moduleDependencies.length > 0) {
      errors.push({
        code: 'MODULE_DEPENDENCY_NOT_ALLOWED',
        message: `模块 ${manifest.id} 声明了模块间依赖，首版不支持`,
        detail: manifest.moduleDependencies.join(', '),
      });
    }
    const commandIds = new Set<string>();
    for (const cmd of manifest.commands ?? []) {
      if (commandIds.has(cmd.id)) {
        errors.push({
          code: 'MODULE_INVALID_MANIFEST',
          message: `模块 ${manifest.id} 命令 ID 重复：${cmd.id}`,
        });
      }
      commandIds.add(cmd.id);
    }

    if (errors.length > 0) {
      return { ok: false, moduleId: manifest.id, errors };
    }

    this.modules.set(manifest.id, {
      manifest,
      bundle,
      state: 'registered',
      preferredEnabled: preferredEnabled ?? manifest.defaultEnabled,
    });
    return { ok: true, moduleId: manifest.id, errors: [] };
  }

  unregister(moduleId: string): boolean {
    const entry = this.modules.get(moduleId);
    if (!entry) return false;
    if (entry.state === 'active') {
      // 由调用方先停用再卸载；这里防御性同步停用。
      void entry.bundle.implementation.onDeactivate().catch(() => undefined);
    }
    return this.modules.delete(moduleId);
  }

  get(moduleId: string): ModuleEntry | undefined {
    return this.modules.get(moduleId);
  }

  list(): ModuleEntry[] {
    return [...this.modules.values()];
  }

  /**
   * 激活模块：先检查必需宿主能力。激活失败标记 error 状态，
   * 不影响其他模块（M04）。
   */
  async activate(moduleId: string, capabilities: HostCapabilities, contextFactory: ModuleContextFactory): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry) throw new CoreError({ code: 'MODULE_NOT_ACTIVE', message: `模块不存在：${moduleId}` });

    for (const cap of entry.manifest.requiredCapabilities ?? []) {
      const claim = capabilities[cap];
      if (!claim?.supported) {
        const error: CoreErrorInfo = {
          code: 'MODULE_MISSING_CAPABILITY',
          message: `模块 ${moduleId} 无法启用：宿主能力不可用（${cap}）`,
          detail: claim?.note,
        };
        entry.state = 'error';
        entry.activationError = error;
        throw new CoreError(error);
      }
    }

    try {
      await entry.bundle.implementation.onActivate(contextFactory(moduleId));
      entry.state = 'active';
      entry.activationError = undefined;
    } catch (e) {
      entry.state = 'error';
      entry.activationError = {
        code: 'INTERNAL_ERROR',
        message: `模块 ${moduleId} 激活失败`,
        detail: e instanceof Error ? e.message : String(e),
      };
      throw e;
    }
  }

  /** 停用并释放。调用方应先等待进行中的操作到达可取消边界。 */
  async deactivate(moduleId: string): Promise<void> {
    const entry = this.modules.get(moduleId);
    if (!entry || entry.state !== 'active') return;
    await entry.bundle.implementation.onDeactivate();
    entry.state = entry.preferredEnabled ? 'registered' : 'disabled';
  }

  setPreferredEnabled(moduleId: string, enabled: boolean): void {
    const entry = this.modules.get(moduleId);
    if (entry) entry.preferredEnabled = enabled;
  }

  isActive(moduleId: string): boolean {
    return this.modules.get(moduleId)?.state === 'active';
  }

  /** 全部命令（供命令搜索）。只含已注册模块；执行时要求模块处于激活态。 */
  allCommands(): CommandEntry[] {
    const out: CommandEntry[] = [];
    for (const entry of this.modules.values()) {
      for (const cmd of entry.manifest.commands ?? []) {
        out.push({
          globalId: `${entry.manifest.id}.${cmd.id}`,
          moduleId: entry.manifest.id,
          moduleTitle: entry.manifest.title,
          commandId: cmd.id,
          title: cmd.title,
          description: cmd.description,
          icon: cmd.icon,
        });
      }
    }
    return out;
  }

  /** 面板贡献（生成导航入口，不手写导航分支）。 */
  panelContributions(): Array<{ moduleId: string; moduleState: ModuleState; manifest: ModuleManifest }> {
    return this.list().map((entry) => ({
      moduleId: entry.manifest.id,
      moduleState: entry.state,
      manifest: entry.manifest,
    }));
  }
}
