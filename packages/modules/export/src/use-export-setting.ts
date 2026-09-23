import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Workspace } from '@aiq/core';
import type { ExportPreferences } from '@aiq/contracts';

export function useExportSetting<K extends keyof ExportPreferences>(workspace: Workspace, key: K, fallback: ExportPreferences[K]): [ExportPreferences[K], Dispatch<SetStateAction<ExportPreferences[K]>>] {
  const [, refresh] = useState(0);
  const settings=workspace.getSettings(),format=settings.exportPreferences?.format??'png';
  const shared=key==='format'||key==='target';
  const value = (!shared?settings.exportFormatPreferences?.[format]?.[key]:undefined) ?? settings.exportPreferences?.[key] ?? fallback;
  const change: Dispatch<SetStateAction<ExportPreferences[K]>> = next => {
    const resolved = typeof next === 'function' ? next(value) : next;
    // Save immediately, including drafts: closing/crashing need not trigger an unload handler.
    const current=workspace.getSettings();
    workspace.updateSettings({ exportPreferences: { ...current.exportPreferences, [key]: resolved },
      ...(!shared?{exportFormatPreferences:{...current.exportFormatPreferences,[format]:{...current.exportFormatPreferences?.[format],[key]:resolved}}}:{}) });
    refresh(n=>n+1);
  };
  return [value, change];
}
