import {afterEach,expect,it,vi} from 'vitest';
import {cepUserFiles} from '../packages/host-adapter/src/user-files.js';
afterEach(()=>vi.unstubAllGlobals());
function fixture(){
 const disk=new Map<string,string>(),root='C:/Users/Test/AppData/Roaming/AIQ-Workbench/';
 const fs={readFile:vi.fn((p:string)=>({err:disk.has(p)?0:3,data:disk.get(p)})),
   stat:(p:string)=>({err:disk.has(p)?0:3}),makedir:()=>({err:0}),
   writeFile:vi.fn((p:string,value:string)=>{disk.set(p,value);return {err:0};}),
   deleteFile:vi.fn((p:string)=>{disk.delete(p);return {err:0};}),
   rename:vi.fn((from:string,to:string)=>{disk.set(to,disk.get(from)!);disk.delete(from);return {err:0};})};
 vi.stubGlobal('cep',{fs});vi.stubGlobal('__adobe_cep__',{getSystemPath:()=> 'file:///C:/Users/Test/AppData/Roaming'});
 return {disk,root,fs,files:cepUserFiles()!};
}
it('keeps the previous complete configuration if final rename fails',()=>{
 const {disk,root,fs,files}=fixture();disk.set(root+'settings.json','{"version":1}');
 fs.rename.mockReturnValue({err:6});expect(()=>files.replace('settings.json','{"version":2}')).toThrow(/保留备份/);
 expect(disk.get(root+'settings.json.bak')).toBe('{"version":1}');expect(disk.get(root+'settings.json.tmp')).toBe('{"version":2}');
});
it('does not replace a valid backup with an already corrupt current file',()=>{
 const {disk,root,files}=fixture();disk.set(root+'settings.json','{');disk.set(root+'settings.json.bak','{"old":true}');
 files.replace('settings.json','{"new":true}');expect(disk.get(root+'settings.json.bak')).toBe('{"old":true}');expect(disk.get(root+'settings.json')).toBe('{"new":true}');
});
it('rejects paths outside its fixed user-data filenames',()=>{
 const {fs,files}=fixture();expect(()=>files.write('../artwork.ai','data')).toThrow(/无效/);expect(fs.writeFile).not.toHaveBeenCalled();expect(fs.deleteFile).not.toHaveBeenCalled();
});
