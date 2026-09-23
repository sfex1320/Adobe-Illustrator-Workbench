import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '@aiq/core';

/** 订阅工作区全部相关事件并触发重渲染。 */
export function useWorkspaceTick(workspace: Workspace): number {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const offs = [
      workspace.events.on('host-info-changed', bump),
      workspace.events.on('document-changed', bump),
      workspace.events.on('snapshot-updated', bump),
      workspace.events.on('result-updated', bump),
      workspace.events.on('modules-changed', bump),
      workspace.events.on('command-finished', bump),
      workspace.events.on('settings-changed', bump),
      workspace.events.on('scope-changed', bump),
      workspace.events.on('error', bump),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [workspace, bump]);

  return tick;
}
