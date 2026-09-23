// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DEFAULT_APP_SETTINGS,SETTINGS_STORAGE_KEY} from '@aiq/contracts';
import type {AppSettings} from '@aiq/contracts';
import {LocalSettingsStore} from '../apps/panel/src/storage';
import {packSettings,unpackSettings,archiveToBase64,archiveFromBase64} from '../apps/panel/src/settings-archive';
import {usePreference} from '../packages/ui/src/preference';
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();});
function diskFixture(){
 const files=new Map<string,string>();
 const fs={stat:(p:string)=>({err:files.has(p)?0:3}),makedir:()=>({err:0}),readFile:(p:string)=>({err:files.has(p)?0:3,data:files.get(p)}),writeFile:vi.fn((p:string,data:string)=>{files.set(p,data);return {err:0};}),deleteFile:(p:string)=>{files.delete(p);return {err:0};},rename:(from:string,to:string)=>{files.set(to,files.get(from)!);files.delete(from);return {err:0};}};
 vi.stubGlobal('cep',{fs});vi.stubGlobal('__adobe_cep__',{getSystemPath:()=> 'file:///C:/Users/Test/AppData/Roaming'});return {files,fs};
}
it('ZIP stores UTF-8 settings, verifies CRC and rejects corrupt data',()=>{
 const raw=JSON.stringify({名称:'选项记忆',checked:false});const bytes=packSettings(raw);expect(unpackSettings(archiveFromBase64(archiveToBase64(bytes)))).toBe(raw);
 bytes[45]=bytes[45]!^1;expect(()=>unpackSettings(bytes)).toThrow(/校验/);expect(()=>unpackSettings(new Uint8Array(3))).toThrow();
});
it.each(['zip','aiqsettings'] as const)('custom %s primary file reloads with false options intact and local recovery',format=>{
 const {files}=diskFixture(),store=new LocalSettingsStore();const settings={...DEFAULT_APP_SETTINGS,sidebarSide:'right',sidebarAutoHide:true,sidebarLocked:true,toolPreferences:{'package.pdfCompatible':false,'annotation.horizontal':false},dataStorage:{folder:'G:/设置测试',format}} as AppSettings;
 store.save(settings);const name='G:/设置测试/AIQ-Workbench/workbench-settings.'+format;expect(files.has(name)).toBe(true);expect(store.status().warning).toBeUndefined();
 localStorage.clear();const loaded=new LocalSettingsStore().load();expect(loaded).toMatchObject(settings);
 // Primary can be newer than the local locator, e.g. settings transported from another machine.
 const newer=JSON.stringify({...settings,uiSize:'small',storageRevision:Date.now()+10000});files.set(name,format==='zip'?archiveToBase64(packSettings(newer)):newer);
 expect(new LocalSettingsStore().load().uiSize).toBe('small');
 files.set(name,'bad');expect(new LocalSettingsStore().load().toolPreferences?.['package.pdfCompatible']).toBe(false);
});
it('unavailable custom disk warns while retaining local preferences',()=>{
 const {fs}=diskFixture();const normal=fs.writeFile.getMockImplementation()!;fs.writeFile.mockImplementation((p,v)=>p.startsWith('G:')?{err:6}:normal(p,v));const store=new LocalSettingsStore();store.save({...DEFAULT_APP_SETTINGS,dataStorage:{folder:'G:/offline',format:'zip'},toolPreferences:{'package.pdfCompatible':false}});
 expect(store.status().warning).toContain('本机恢复副本');expect(new LocalSettingsStore().load().toolPreferences?.['package.pdfCompatible']).toBe(false);
});
it('preference hook never saves mounting defaults and remembers explicit unchecked changes across remount',()=>{
 let settings:AppSettings={...DEFAULT_APP_SETTINGS};const updateSettings=vi.fn((patch:Partial<AppSettings>)=>{settings={...settings,...patch};});const port={getSettings:()=>settings,updateSettings};
 function Option(){const [value,setValue]=usePreference(port,'package.pdfCompatible',true);return <input aria-label="PDF" type="checkbox" checked={value} onChange={e=>setValue(e.target.checked)}/>;}
 const view=render(<Option/>);expect(updateSettings).not.toHaveBeenCalled();fireEvent.click(screen.getByLabelText('PDF'));expect(settings.toolPreferences?.['package.pdfCompatible']).toBe(false);view.unmount();render(<Option/>);expect(screen.getByLabelText('PDF')).not.toBeChecked();expect(updateSettings).toHaveBeenCalledTimes(1);
});
it('corrupt optional sidebar, storage and preference trees cannot break startup',()=>{
 diskFixture();localStorage.setItem(SETTINGS_STORAGE_KEY,JSON.stringify({...DEFAULT_APP_SETTINGS,sidebarSide:'bottom',sidebarLocked:'yes',dataStorage:{folder:'../outside',format:'zip'},toolPreferences:{'package.formats':{constructor:'bad'}}}));
 const s=new LocalSettingsStore().load();expect(s.sidebarSide).toBeUndefined();expect(s.sidebarLocked).toBeUndefined();expect(s.dataStorage).toBeUndefined();expect(s.toolPreferences).toBeUndefined();
});
