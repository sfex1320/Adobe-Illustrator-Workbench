/** 用户设置契约。文档对象指针与过期文本范围禁止写入持久设置。 */
import type { ExportNaming, ExportAnnotation, RulerUnit } from './editor.js';

/** Only preferences; never persists document objects, selections or command tokens. */
export interface ExportPreferences {
  collection: boolean;
  rasterSmoothing: 'standard'|'high'; rasterConvertSpots: boolean; writeLayers: boolean; layeredTiff: boolean; rasterIndependent: boolean; rasterProfile: 'source'|'standard'|'custom'; rasterIccPath: string; rasterOptimize: boolean;
  format: 'png'|'jpeg'|'svg'|'pdf'|'ai'|'eps'|'tif'|'psd';
  target: 'objects'|'artboards';
  screenExport: boolean; pdfCompatible: boolean; compression: boolean; outlineText: boolean; overprintBlack: boolean;
  colorMode: 'source'|'rgb'|'cmyk';
  dpi: string; quality: string; transparent: boolean; editable: boolean; embed: boolean;
  bleedMode: 'manual'|'document'; useBleed: boolean; bleed: string; offset: string;
  annotation: ExportAnnotation;
}

export type ThemeSetting = 'follow' | 'light' | 'dark';

export interface AppSettings {
  version: 1;
  theme: ThemeSetting;
  uiSize?: 'small'|'compact'|'medium'|'mediumPlus'|'comfortable'|'large';
  /** Unscaled panel sidebar width; never a document dimension. */
  sidebarWidth?: number;
  sidebarSide?: 'left'|'right';
  sidebarAutoHide?: boolean;
  sidebarLocked?: boolean;
  /** User options only; no document identities, selection references or running jobs. */
  toolPreferences?: Record<string, unknown>;
  dataStorage?: { folder: string; format: 'zip'|'aiqsettings' };
  exportFolder?: string;
  exportOpenFolder?: boolean;
  exportNaming?: ExportNaming;
  exportScale?: number;
  exportPreferences?: Partial<ExportPreferences>;
  exportFormatPreferences?: Partial<Record<ExportPreferences['format'], Partial<ExportPreferences>>>;
  workbenchView?: { group: string; tool: string };
  toolScroll?: Record<string, number>;
  propertyDrawerOpen?: boolean;
  lastExportJobId?: string;
  variablePreferences?: {columns:number;gap:number;imageBase:string;encoding:string;includeHidden:boolean;rowsPerBlock?:number;horizontalGap?:number;verticalGap?:number;headerDirection?:'row'|'column'};
  /** Return-to-panel single read only; never enables host polling. */
  liveEditorSync?: boolean;
  sizePreferences?: {
    width:string; height:string;
    unit:'auto'|'mm'|'pt'|'cm'|'m'|'px'; valueUnit?:RulerUnit;
    proportion:'width'|'height'|null; together:'each'|'all'; includeBleed:boolean;
  };
  fontFavorites?: string[];
  /** 导出目录历史（最近优先，最多 8 条），供下拉快速选择；不包含文档对象指针。 */
  exportFolders?: string[];
  exportAlongsideSource?: boolean;
  exportFavorites?: string[];
  exportCreateSubfolder?: boolean;
  exportSubfolderName?: string;
  /** 模块启停偏好；未列出的模块使用 manifest.defaultEnabled。 */
  enabledModules: Record<string, boolean>;
  /** 查询偏好：仅范围形态与开关，不含任何文档内对象指针。 */
  scopePreference: {
    kind: 'document' | 'artboard' | 'layer' | 'selection';
    pierceGroups: boolean;
    pierceClipGroups: boolean;
    includeMaskPaths: boolean;
    includeHidden: boolean;
    includeLocked: boolean;
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  theme: 'follow',
  enabledModules: {},
  scopePreference: {
    kind: 'document',
    pierceGroups: true,
    pierceClipGroups: true,
    includeMaskPaths: false,
    includeHidden: false,
    includeLocked: false,
  },
};

/** 设置存储端口。实现方负责损坏捕获与可解释默认值。 */
export interface SettingsStorePort {
  load(): AppSettings;
  save(settings: AppSettings): void;
  status?(): {location:string;warning?:string};
}
