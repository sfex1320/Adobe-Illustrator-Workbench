import {afterEach,expect,it,vi} from 'vitest';
import {runWorkbenchUpdate} from '../packages/host-adapter/src/updater.js';
afterEach(()=>vi.unstubAllGlobals());
it('does not offer simulated update success outside CEP',async()=>{await expect(runWorkbenchUpdate('check','github','')).rejects.toThrow(/Windows Illustrator/);});
it('rejects non-HTTPS and credential-bearing mirrors before launching a process',async()=>{
 const launch=vi.fn();vi.stubGlobal('cep',{process:{createProcess:launch},fs:{stat:()=>({err:1})}});vi.stubGlobal('__adobe_cep__',{getSystemPath:()=> 'C:/fixture'});
 for(const mirror of ['http://example.com/','https://user:pass@example.com/','https://example.com/?key=secret'])await expect(runWorkbenchUpdate('check','mirror',mirror)).rejects.toThrow(/HTTPS/);
 expect(launch).not.toHaveBeenCalled();
});
it('reports the real queued receipt and never calls the host channel',async()=>{
 const files=new Map<string,string>();let onquit:()=>void=()=>{};
 const launch=vi.fn((...args:string[])=>{const nonce=args.at(-1)!;files.set('C:/fixture/AIQ-Workbench/update-result-'+nonce+'.json',JSON.stringify({ok:true,status:'waiting',version:'0.6.39'}));return {err:0,data:42};});
 const host=vi.fn();vi.stubGlobal('__adobe_cep__',{getSystemPath:()=> 'C:/fixture',evalScript:host});
 vi.stubGlobal('cep',{fs:{stat:()=>({err:0}),makedir:()=>({err:0}),writeFile:(p:string,v:string)=>{files.set(p,v);return {err:0};},readFile:(p:string)=>({err:0,data:files.get(p)}),deleteFile:(p:string)=>{files.delete(p);return {err:0};}},process:{createProcess:launch,onquit:(_pid:number,cb:()=>void)=>{onquit=cb;return {err:0};},isRunning:()=>({err:0,data:true})}});
 const promise=runWorkbenchUpdate('install','github','');onquit();expect((await promise).status).toBe('waiting');expect(host).not.toHaveBeenCalled();expect(launch.mock.calls[0]).toContain('Hidden');
});
