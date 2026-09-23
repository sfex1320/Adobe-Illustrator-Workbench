import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '@aiq/core';
import { CepBridge, CepHostAdapter, DemoHostAdapter, detectCepEvalScript, installCepInputKeys } from '@aiq/host-adapter';
import '@aiq/ui/theme.css';
import './workbench.css';
import { discoverModules } from './module-discovery';
import { PanelApp } from './App';
import type { DemoExtensions } from './App';
import { LocalSettingsStore } from './storage';
import { PanelErrorBoundary } from './PanelErrorBoundary';

// Suppress the CEP browser menu throughout the panel, including portals.
// Do not stop propagation: alignment buttons retain their own right-click action.
document.addEventListener('contextmenu',event=>event.preventDefault(),true);
installCepInputKeys();

async function bootstrap(): Promise<void> {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('找不到 #root 挂载点');
  const root = createRoot(rootEl);

  // 环境选择：CEP 宿主存在时走真实桥接；浏览器开发环境走演示适配器（演示徽标常显）。
  // 宿主运行中失败保留错误，不会静默替换为演示数据。
  const evalScript = detectCepEvalScript();
  const useCep = evalScript !== null;
  const adapter = useCep
    ? new CepHostAdapter(new CepBridge(evalScript!))
    : new DemoHostAdapter();
  const demoAdapter = adapter instanceof DemoHostAdapter ? adapter : null;

  const workspace = new Workspace({
    adapter,
    settingsStore: new LocalSettingsStore(),
  });

  const discovered = await discoverModules();
  for (const mod of discovered) {
    workspace.registerModule(mod.bundle);
  }
  // A host connection/document read failure must not prevent the shell and its
  // explicit reconnect/settings controls from mounting. Never fall back to demo.
  try {
    await workspace.initialize();
  } catch {
    // initialize records a safe, user-facing connection error on the workspace.
  }
  await workspace.activateAvailableModules();

  const demoExtensions: DemoExtensions | null = demoAdapter
    ? {
        addToSelection: (ids) => demoAdapter.addToSelection(ids),
        clearSelection: () => demoAdapter.setSelection([]),
        currentSelectionIds: () => demoAdapter.getSelectionIds(),
        simulateExternalEdit: () => demoAdapter.simulateExternalEdit(),
        listSessions: async () =>
          (await demoAdapter.listDocuments()).map((d) => ({ sessionId: d.sessionId, name: d.name })),
      }
    : null;

  root.render(
    <StrictMode>
      <PanelErrorBoundary onRecover={()=>{workspace.updateSettings({workbenchView:{group:'home',tool:''}});window.location.reload();}}><PanelApp workspace={workspace} discovered={discovered} demoExtensions={demoExtensions} /></PanelErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap().catch((e) => {
  console.error('[aiq-panel] 启动失败', e);
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.textContent = `面板启动失败：${e instanceof Error ? e.message : String(e)}`;
  }
});
