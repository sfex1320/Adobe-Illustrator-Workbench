import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
import {Workspace} from '@aiq/core';
import {DemoHostAdapter} from '@aiq/host-adapter';
import {DEFAULT_APP_SETTINGS} from '@aiq/contracts';

function host(){
 const selectTool=vi.fn(()=>true),sleep=vi.fn(()=>{throw Error('Must not wait for tool changes');});
 const doc={get artboards(){throw Error('Must not enumerate artboards');},get selection(){throw Error('Must not enumerate selection');}};
 const c=vm.createContext({app:{version:'30.0.0',documents:[doc],activeDocument:doc,selectTool},$:{sleep}});
 vm.runInContext(readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8'),c);
 return {selectTool,sleep,run:(tool:string)=>JSON.parse(vm.runInContext(`AIQ.handle(${JSON.stringify(encodeURIComponent(JSON.stringify({id:'tool',command:'SELECT_NATIVE_TOOL',params:{tool}})))})`,c))};
}
it.each([['selection','Adobe Select Tool'],['text','Adobe Type Tool'],['artboard','Adobe Crop Tool']])('switches %s once without reading artwork or artboards', (tool,name)=>{
 const h=host();expect(h.run(tool)).toMatchObject({ok:true,data:{tool}});expect(h.selectTool).toHaveBeenCalledExactlyOnceWith(name);expect(h.sleep).not.toHaveBeenCalled();
});
it('rejects unknown tool names before touching Illustrator',()=>{const h=host();expect(h.run('constructor').ok).toBe(false);expect(h.selectTool).not.toHaveBeenCalled();});
it('reports a rejected switch instead of success',()=>{const h=host();h.selectTool.mockReturnValue(false);expect(h.run('text').ok).toBe(false);});
it('serializes switches and cancels superseded queued navigation without reading a document',async()=>{
 let release!:()=>void;
 const adapter=Object.assign(new DemoHostAdapter(),{selectNativeTool:vi.fn(async(tool:string)=>{if(tool==='artboard')await new Promise<void>(r=>{release=r;});return {tool};})});
 const w=new Workspace({adapter,settingsStore:{load:()=>({...DEFAULT_APP_SETTINGS}),save:()=>{}}});await w.initialize();
 const read=vi.spyOn(w,'readEditorState');
 const first=w.selectNativeTool('artboard'),old=new AbortController();
 const second=w.selectNativeTool('text',old.signal).catch(e=>e.code);
 old.abort();const latest=w.selectNativeTool('selection');release();
 await first;expect(await second).toBe('OPERATION_CANCELLED');await latest;
 expect(adapter.selectNativeTool.mock.calls.map(c=>c[0])).toEqual(['artboard','selection']);expect(read).not.toHaveBeenCalled();
});
