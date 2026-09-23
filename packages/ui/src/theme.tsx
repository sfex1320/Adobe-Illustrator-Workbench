import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeSetting } from '@aiq/contracts';

/**
 * 主题上下文：'follow' 时优先宿主主题（CEP appSkinInfo），无宿主回退系统偏好，
 * 并如实显示回退来源（“跟随宿主”/“跟随系统”）。
 */

export type EffectiveThemeSource = 'host' | 'system' | 'setting';

export interface ThemeState {
  setting: ThemeSetting;
  effective: 'light' | 'dark';
  /** follow 模式下实际生效来源。 */
  source: EffectiveThemeSource;
  setSetting(setting: ThemeSetting): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** 宿主主题解析：由面板组合层注入（CEP 读 appSkinInfo；浏览器返回 null）。 */
export type HostThemeResolver = () => 'light' | 'dark' | null;

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  initialSetting = 'follow',
  resolveHostTheme,
  onSettingChange,
}: {
  children: ReactNode;
  initialSetting?: ThemeSetting;
  resolveHostTheme?: HostThemeResolver;
  onSettingChange?: (setting: ThemeSetting) => void;
}) {
  const [setting, setSettingState] = useState<ThemeSetting>(initialSetting);
  const [systemValue, setSystemValue] = useState<'light' | 'dark'>(() => systemTheme());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent): void => setSystemValue(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const [hostTheme, setHostTheme] = useState<'light' | 'dark' | null>(() => resolveHostTheme?.() ?? null);
  useEffect(() => {
    const refresh = () => setHostTheme(resolveHostTheme?.() ?? null);
    refresh();
    if (!resolveHostTheme || setting !== 'follow') return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [resolveHostTheme, setting]);

  const { effective, source } = useMemo(() => {
    if (setting === 'light' || setting === 'dark') {
      return { effective: setting, source: 'setting' as EffectiveThemeSource };
    }
    if (hostTheme) return { effective: hostTheme, source: 'host' as EffectiveThemeSource };
    return { effective: systemValue, source: 'system' as EffectiveThemeSource };
  }, [setting, hostTheme, systemValue]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effective);
  }, [effective]);

  const setSetting = useCallback(
    (next: ThemeSetting) => {
      setSettingState(next);
      onSettingChange?.(next);
    },
    [onSettingChange],
  );

  const value = useMemo<ThemeState>(
    () => ({ setting, effective, source, setSetting }),
    [setting, effective, source, setSetting],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}

export const THEME_SOURCE_LABELS: Record<EffectiveThemeSource, string> = {
  host: '跟随宿主',
  system: '跟随系统',
  setting: '手动设置',
};
