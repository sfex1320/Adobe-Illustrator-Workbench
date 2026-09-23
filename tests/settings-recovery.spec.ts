// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DEFAULT_APP_SETTINGS,SETTINGS_STORAGE_KEY} from '@aiq/contracts';
const files=vi.hoisted(()=>({read:vi.fn(),replace:vi.fn()}));
vi.mock('@aiq/host-adapter',()=>({cepUserFiles:()=>files}));
import {LocalSettingsStore} from '../apps/panel/src/storage.js';
beforeEach(()=>{localStorage.clear();files.read.mockReset().mockReturnValue(null);files.replace.mockReset();});
afterEach(()=>vi.restoreAllMocks());
it('restores each supported UI size and discards corrupt old font preferences',()=>{
 for(const uiSize of ['small','compact','medium','comfortable','large'] as const){
  localStorage.clear();files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,uiSize}));
  expect(new LocalSettingsStore().load().uiSize).toBe(uiSize);
 }
 files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,uiSize:'1000%'}));
 expect(new LocalSettingsStore().load().uiSize).toBeUndefined();
});
it('keeps explicit false AI compatibility while discarding a corrupt compatibility option',()=>{
 const store=new LocalSettingsStore();store.save({...DEFAULT_APP_SETTINGS,exportFormatPreferences:{ai:{pdfCompatible:false}}});
 expect(store.load().exportFormatPreferences?.ai?.pdfCompatible).toBe(false);
 localStorage.clear();files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,exportFormatPreferences:{ai:{pdfCompatible:'false'}}}));
 expect(store.load().exportFormatPreferences?.ai?.pdfCompatible).toBeUndefined();
});
it('recovers the last complete backup when both current copies are corrupt',()=>{
 files.read.mockImplementation((name:string)=>name.endsWith('.bak')?JSON.stringify({...DEFAULT_APP_SETTINGS,theme:'light'}):'{bad');
 localStorage.setItem(SETTINGS_STORAGE_KEY,'{');
 expect(new LocalSettingsStore().load().theme).toBe('light');
});
it('prefers newer browser settings after a failed disk write',()=>{
 files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,theme:'dark',storageRevision:1}));
 files.replace.mockImplementation(()=>{throw Error('disk full');});
 new LocalSettingsStore().save({...DEFAULT_APP_SETTINGS,theme:'light',exportPreferences:{format:'jpeg',dpi:'150'}});
 expect(new LocalSettingsStore().load()).toMatchObject({theme:'light',exportPreferences:{format:'jpeg',dpi:'150'}});
});
it('keeps disk settings when browser storage is denied',()=>{
 files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,theme:'light'}));
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('denied');});
 expect(new LocalSettingsStore().load().theme).toBe('light');
});
it('invalid optional preferences are discarded without losing theme',()=>{
 localStorage.setItem(SETTINGS_STORAGE_KEY,JSON.stringify({...DEFAULT_APP_SETTINGS,theme:'light',exportPreferences:'bad',toolScroll:{'export:main':NaN}}));
 expect(new LocalSettingsStore().load()).toMatchObject({theme:'light',toolScroll:{}});
 expect(new LocalSettingsStore().load().exportPreferences).toBeUndefined();
});

it('size memory roundtrips while damaged optional size data is discarded',()=>{
 const size={width:'42.0000',height:'21.0000',unit:'auto',valueUnit:'in',proportion:'width',together:'all',includeBleed:true} as const;
 const store=new LocalSettingsStore();store.save({...DEFAULT_APP_SETTINGS,sizePreferences:size});expect(store.load().sizePreferences).toEqual(size);
 localStorage.clear();files.read.mockReturnValue(JSON.stringify({...DEFAULT_APP_SETTINGS,sizePreferences:{...size,unit:'invalid'}}));expect(new LocalSettingsStore().load().sizePreferences).toBeUndefined();
});
