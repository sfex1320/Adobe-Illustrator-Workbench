import type { IconName } from '@aiq/contracts';

/** 内联 SVG 图标集（线性风格）。新增图标名在此登记即可，模块不自带图标实现。 */

const PATHS: Record<IconName, JSX.Element> = {
  settings: <><path d="M10 3h4l.6 3 2 .9 2.7-1 2 3.4-2.1 2.1v2.2l2.1 2.1-2 3.4-2.7-1-2 .9-.6 3h-4l-.6-3-2-.9-2.7 1-2-3.4 2.1-2.1v-2.2L2.7 9.3l2-3.4 2.7 1 2-.9z"/><circle cx="12" cy="12" r="3"/></>,
  swapVertical: <path d="M7 20V4m-4 4 4-4 4 4m6-4v16m-4-4 4 4 4-4"/>,
  hand: <path d="M8 12V5a1.5 1.5 0 013 0v6-8a1.5 1.5 0 013 0v8-6a1.5 1.5 0 013 0v7-4a1.5 1.5 0 013 0v8c0 4-3 6-6 6h-1c-2 0-3-1-4-3l-4-5a1.5 1.5 0 012-2l3 3"/>,
  stats: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  select: (
    <>
      <path d="M5 3l14 8-6 2-2 6z" />
    </>
  ),
  modules: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 11-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  theme: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" />
    </>
  ),
  doc: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3L1 21h22z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="18" r="0.4" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="8" r="0.4" fill="currentColor" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  check: (
    <>
      <path d="M4 12l5 5L20 6" />
    </>
  ),
  text: (
    <>
      <path d="M5 5h14M12 5v14M9 19h6" />
    </>
  ),
  size: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M9 4v16M4 9h16" />
    </>
  ),
  swap: (
    <>
      <path d="M7 8h13l-3-3M17 16H4l3 3" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M8 7L4 12l4 5zM16 7l4 5-4 5z" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14l-5-5 5-5" />
      <path d="M4 9h10a6 6 0 016 6v1" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
