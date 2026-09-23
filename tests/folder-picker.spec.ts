import {afterEach,expect,it,vi} from 'vitest';
import {chooseSystemFolder} from '../packages/host-adapter/src/folder-picker';
afterEach(()=>vi.unstubAllGlobals());
it('launches only bundled picker with argument boundaries, deduplicates and clears its response',async()=>{
 let quit:()=>void=()=>{},reply='';const remove=vi.fn(()=>({err:0})),read=vi.fn(()=>({err:0,data:reply}));
 const launch=vi.fn(()=>({err:0,data:42}));
 vi.stubGlobal('cep',{fs:{readFile:read,stat:()=>({err:0}),deleteFile:remove},process:{createProcess:launch,onquit:(_pid:number,fn:()=>void)=>{quit=fn;return {err:0};},isRunning:()=>({err:0,data:true})}});
 vi.stubGlobal('__adobe_cep__',{getSystemPath:(kind:string)=>kind==='extension'?'file:///G:/工作台':'file:///C:/Users/Test/AppData/Roaming'});
 const p=chooseSystemFolder('G:/含 空格/$目录');expect(chooseSystemFolder()).toBe(p);expect(launch).toHaveBeenCalledWith('G:/工作台/bin/FolderPicker.exe',expect.stringMatching(/^[a-f0-9]{32}$/),'G:/含 空格/$目录');
 reply=JSON.stringify({ok:true,folder:'G:\\中文目录'});quit();expect(await p).toBe('G:\\中文目录');expect(remove).toHaveBeenCalledOnce();
 const cancel=chooseSystemFolder();reply=JSON.stringify({ok:true,folder:null});quit();expect(await cancel).toBeNull();
});
it('missing native picker is an explicit failure rather than legacy save dialog fallback',async()=>{await expect(chooseSystemFolder()).rejects.toThrow(/粘贴目录/);});
