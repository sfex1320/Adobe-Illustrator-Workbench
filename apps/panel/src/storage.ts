import {packSettings,unpackSettings,archiveToBase64,archiveFromBase64} from './settings-archive';
import { cepUserFiles } from '@aiq/host-adapter';
import { DEFAULT_APP_SETTINGS, SETTINGS_STORAGE_KEY } from '@aiq/contracts';
import type { AppSettings, SettingsStorePort } from '@aiq/contracts';

/** 双份设置与最后完整备份；按修订时间选取，避免磁盘失败后恢复旧设置。 */
export class LocalSettingsStore implements SettingsStorePort {
  private revision = 0;
  private storageStatus:{location:string;warning?:string}={location:'本机用户数据目录'};
  status(){return this.storageStatus;}
  load(): AppSettings {
    const candidates: string[]=[];
    try { const disk=cepUserFiles();for(const name of ['settings.json','settings.json.bak']){const value=disk?.read(name);if(value)candidates.push(value);} } catch { /* browser copy remains available */ }
    try { for(const key of [SETTINGS_STORAGE_KEY,SETTINGS_STORAGE_KEY+'.backup']){const value=localStorage.getItem(key);if(value)candidates.push(value);} } catch { /* disk copy remains available */ }
    // A fixed local recovery copy locates the optional user-selected primary file.
    const localCopies=[...candidates].sort((a,b)=>{try{return (JSON.parse(b).storageRevision??0)-(JSON.parse(a).storageRevision??0);}catch{return 0;}});
    for(const raw of localCopies){try{const storage=JSON.parse(raw).dataStorage;if(!validStorage(storage))continue;const disk=cepUserFiles(storage.folder),zip=storage.format==='zip',name='workbench-settings.'+storage.format;
      for(const file of [name,name+'.bak']){const data=disk?.read(file,zip?'Base64':undefined);if(data)try{candidates.push(zip?unpackSettings(archiveFromBase64(data)):data);}catch{/* local recovery remains */}}
      break;
    }catch{/* local recovery remains */}}
    let raw: string|null=null, newest=-1;
    for(const candidate of candidates) {
      try { const parsed=JSON.parse(candidate),revision=Number.isFinite(parsed?.storageRevision)?parsed.storageRevision:0;
        if(parsed?.version===1&&['follow','light','dark'].includes(parsed.theme)&&typeof parsed.enabledModules==='object'&&parsed.enabledModules!==null&&typeof parsed.scopePreference==='object'&&parsed.scopePreference!==null&&revision>newest){raw=candidate;newest=revision;}
      } catch { /* try last complete copy */ }
    }
    this.revision=Math.max(0,newest);
    if (!raw) {
      return { ...DEFAULT_APP_SETTINGS, enabledModules: {}, scopePreference: { ...DEFAULT_APP_SETTINGS.scopePreference } };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (
      parsed.version !== 1 ||
      typeof parsed.theme !== 'string' ||
      typeof parsed.enabledModules !== 'object' ||
      parsed.enabledModules === null ||
      typeof parsed.scopePreference !== 'object' ||
      parsed.scopePreference === null
    ) {
      throw new Error('设置格式不符');
    }
    // New preferences are bounded; corrupt optional fields cannot crash the panel.
    const sanitizePreferences=(value: unknown)=>{
      if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
      const prefs=value as NonNullable<AppSettings['exportPreferences']>;
      const allowed: Record<string,string[]>={rasterSmoothing:['standard','high'],format:['png','jpeg','svg','pdf','ai','eps','tif','psd'],target:['objects','artboards'],colorMode:['source','rgb','cmyk'],bleedMode:['manual','document']};
      for(const [key,values] of Object.entries(allowed))if(!values.includes((prefs as Record<string,unknown>)[key] as string))delete (prefs as Record<string,unknown>)[key];
      for(const key of ['screenExport','pdfCompatible','compression','outlineText','overprintBlack','transparent','editable','embed','useBleed'])if(typeof (prefs as Record<string,unknown>)[key]!=='boolean')delete (prefs as Record<string,unknown>)[key];
      for(const key of ['dpi','quality','bleed','offset'])if(typeof (prefs as Record<string,unknown>)[key]!=='string'||String((prefs as Record<string,unknown>)[key]).length>32)delete (prefs as Record<string,unknown>)[key];
      if(prefs.annotation&&(!['top-left','top-right','bottom-left','bottom-right'].includes(prefs.annotation.position)||['enabled','size','resolution','colors','bleed'].some(k=>typeof (prefs.annotation as unknown as Record<string,unknown>)[k]!=='boolean')))delete prefs.annotation;
      return prefs;
    };
    parsed.exportPreferences=sanitizePreferences(parsed.exportPreferences);
    if(parsed.exportFormatPreferences){const profiles:NonNullable<AppSettings['exportFormatPreferences']>={};for(const f of ['png','jpeg','svg','pdf','ai','eps','tif','psd'] as const){const value=sanitizePreferences(parsed.exportFormatPreferences[f]);if(value)profiles[f]=value;}parsed.exportFormatPreferences=profiles;}
    if(parsed.workbenchView&&(typeof parsed.workbenchView.group!=='string'||typeof parsed.workbenchView.tool!=='string'))delete parsed.workbenchView;
    if(parsed.toolScroll)parsed.toolScroll=Object.fromEntries(Object.entries(parsed.toolScroll).filter(([k,v])=>k.length<100&&Number.isFinite(v)&&v>=0&&v<1000000).slice(-100));
    const vp=parsed.variablePreferences;
    if(vp&&(!Number.isInteger(vp.columns)||vp.columns<1||vp.columns>10||!Number.isFinite(vp.gap)||vp.gap<0||vp.gap>1000||typeof vp.imageBase!=='string'||!['utf-8','gb18030'].includes(vp.encoding)||typeof vp.includeHidden!=='boolean'))delete parsed.variablePreferences;
    if(typeof parsed.liveEditorSync!=='boolean')delete parsed.liveEditorSync;
    if(!['small','compact','medium','mediumPlus','comfortable','large'].includes(parsed.uiSize??''))delete parsed.uiSize;
    if(typeof parsed.sidebarWidth!=='number'||!Number.isFinite(parsed.sidebarWidth)||parsed.sidebarWidth<62||parsed.sidebarWidth>190)delete parsed.sidebarWidth;
    if(!['left','right'].includes(parsed.sidebarSide??''))delete parsed.sidebarSide;
    if(typeof parsed.sidebarAutoHide!=='boolean')delete parsed.sidebarAutoHide;
    if(typeof parsed.sidebarLocked!=='boolean')delete parsed.sidebarLocked;
    if(!validStorage(parsed.dataStorage))delete parsed.dataStorage;
    if(parsed.toolPreferences){if(!safePreference(parsed.toolPreferences,0))delete parsed.toolPreferences;else parsed.toolPreferences=Object.fromEntries(Object.entries(parsed.toolPreferences).filter(([key])=>/^[a-zA-Z][a-zA-Z0-9.-]{0,100}$/.test(key)));}
    this.storageStatus={location:parsed.dataStorage?parsed.dataStorage.folder+'/AIQ-Workbench/workbench-settings.'+parsed.dataStorage.format:'本机用户数据目录'};
    const size=parsed.sizePreferences;
    if(size&&(typeof size.width!=='string'||size.width.length>32||typeof size.height!=='string'||size.height.length>32||!['auto','mm','pt','cm','m','px'].includes(size.unit)||size.valueUnit!==undefined&&!['mm','pt','cm','m','px','in','pc','Q'].includes(size.valueUnit)||![null,'width','height'].includes(size.proportion)||!['each','all'].includes(size.together)||typeof size.includeBleed!=='boolean'))delete parsed.sizePreferences;
    return parsed as AppSettings;
  }

  save(settings: AppSettings): void {
    this.revision=Math.max(Date.now(),this.revision+1);
    const raw=JSON.stringify({...settings,storageRevision:this.revision});let saved=false;
    if(raw.length>524288)throw Error('工作台设置过大');
    this.storageStatus={location:'本机用户数据目录'};
    if(validStorage(settings.dataStorage)){
      const {folder,format}=settings.dataStorage;this.storageStatus={location:folder+'/AIQ-Workbench/workbench-settings.'+format};
      try{const disk=cepUserFiles(folder);if(!disk)throw Error('当前环境不能写入目录');const zip=format==='zip';disk.replace('workbench-settings.'+format,zip?archiveToBase64(packSettings(raw)):raw,zip?'Base64':undefined);saved=true;}
      catch{this.storageStatus.warning='指定设置位置暂不可写，已改用本机恢复副本；请检查该目录。';}
    }
    try{const disk=cepUserFiles();if(disk){disk.replace('settings.json',raw);saved=true;}}catch{/* browser backup remains available */}
    try{const old=localStorage.getItem(SETTINGS_STORAGE_KEY);if(old)localStorage.setItem(SETTINGS_STORAGE_KEY+'.backup',old);localStorage.setItem(SETTINGS_STORAGE_KEY,raw);saved=true;}catch{if(!saved)throw Error('设置无法保存，请检查用户数据目录空间');}
  }
}

/** CEP 宿主主题解析：读 appSkinInfo 面板背景亮度。非 CEP 环境返回 null。 */
export function resolveCepHostTheme(): 'light' | 'dark' | null {
  try {
    const cep = (globalThis as { __adobe_cep__?: { getHostEnvironment?: () => string } }).__adobe_cep__;
    if (!cep || typeof cep.getHostEnvironment !== 'function') return null;
    const env = JSON.parse(cep.getHostEnvironment()) as {
      appSkinInfo?: { panelBackgroundColor?: { color?: { red: number; green: number; blue: number } } };
    };
    const color = env.appSkinInfo?.panelBackgroundColor?.color;
    if (!color) return null;
    const luminance = (0.299 * color.red + 0.587 * color.green + 0.114 * color.blue) / 255;
    return luminance > 0.5 ? 'light' : 'dark';
  } catch {
    return null;
  }
}

function validStorage(v:unknown):v is NonNullable<AppSettings['dataStorage']>{if(!v||typeof v!=='object')return false;const s=v as Record<string,unknown>;return typeof s.folder==='string'&&s.folder.length<2048&&/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(s.folder)&&!Array.from(s.folder).some(c=>c.charCodeAt(0)<32)&&['zip','aiqsettings'].includes(s.format as string);}
function safePreference(v:unknown,depth:number):boolean{if(depth>6)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='string')return v.length<=4096;if(typeof v==='number')return Number.isFinite(v);if(Array.isArray(v))return v.length<=100&&v.every(x=>safePreference(x,depth+1));if(v&&typeof v==='object')return Object.keys(v).length<=250&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&safePreference(x,depth+1));return false;}
