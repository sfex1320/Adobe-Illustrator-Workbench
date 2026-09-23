import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeSetting } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Icon } from '@aiq/ui';

export interface PaletteCommand {
  id: string;
  title: string;
  description?: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  run: () => void | Promise<void>;
}

/** 命令搜索：Ctrl+K 打开；Enter 执行；Escape 关闭；上下键选择（U04）。 */
export function CommandPalette({
  workspace,
  extraCommands,
  onActionError,
  open,
  onClose,
}: {
  workspace: Workspace;
  extraCommands: PaletteCommand[];
  onActionError: (message: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeModuleIds = workspace.registry.list().filter(entry=>entry.state==='active').map(entry=>entry.manifest.id).join('|');
  const commands = useMemo<PaletteCommand[]>(() => {
    const activeModules = new Set(activeModuleIds.split('|'));
    const moduleCommands: PaletteCommand[] = workspace.registry.allCommands().filter(cmd=>activeModules.has(cmd.moduleId)).map((cmd) => ({
      id: cmd.globalId,
      title: `${cmd.moduleTitle}：${cmd.title}`,
      description: cmd.description,
      icon: cmd.icon,
      run: () => workspace.runModuleCommand(cmd.globalId),
    }));
    return [...moduleCommands, ...extraCommands];
  }, [workspace, extraCommands, activeModuleIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const execute = async (index: number) => {
    const cmd = filtered[index];
    if (!cmd) return;
    onClose();
    try {
      await cmd.run();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : '命令执行失败');
    }
  };

  return (
    <div
      className="aiq-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="aiq-dialog" role="dialog" aria-modal="true" aria-label="命令搜索">
        <div className="aiq-row">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="aiq-input"
            style={{ flex: 1 }}
            value={query}
            placeholder="搜索命令（模块命令与面板命令）"
            aria-label="搜索命令"
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if(e.nativeEvent.isComposing||e.keyCode===229)return;
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void execute(cursor);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
            }}
          />
          <button type="button" className="aiq-button" onClick={onClose} aria-label="关闭命令搜索">
            <Icon name="close" />
          </button>
        </div>
        {filtered.length === 0 ? (
          <p className="aiq-empty">没有匹配的命令</p>
        ) : (
          <ul className="aiq-command-list" role="listbox" aria-label="命令列表">
            {filtered.slice(0, 12).map((cmd, index) => (
              <li key={cmd.id} role="option" aria-selected={index === cursor}>
                <button
                  type="button"
                  className="aiq-nav-item"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => void execute(index)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {cmd.icon ? <Icon name={cmd.icon} /> : null}
                  <span>{cmd.title}</span>
                  {cmd.description ? (
                    <span className="aiq-stat-value" style={{ marginLeft: 'auto' }}>
                      {cmd.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 供 App 组装的内置命令。 */
export function builtinCommands(options: {
  setTheme: (theme: ThemeSetting) => void;
  openModules: () => void;
  refreshSnapshot: () => void;
  undoWrite: () => void;
}): PaletteCommand[] {
  const { setTheme, openModules, refreshSnapshot, undoWrite } = options;
  return [
    { id: '__theme.light', title: '主题：切换到浅色', icon: 'theme', run: () => setTheme('light') },
    { id: '__theme.dark', title: '主题：切换到深色', icon: 'theme', run: () => setTheme('dark') },
    { id: '__theme.follow', title: '主题：跟随宿主/系统', icon: 'theme', run: () => setTheme('follow') },
    { id: '__open.modules', title: '打开模块管理', icon: 'modules', run: openModules },
    {
      id: '__snapshot.refresh',
      title: '刷新当前范围快照',
      icon: 'refresh',
      run: () => refreshSnapshot(),
    },
    { id: '__write.undo', title: '撤销上次写入', icon: 'undo', run: () => undoWrite() },
  ];
}
