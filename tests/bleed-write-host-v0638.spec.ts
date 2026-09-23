import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const fn=source.slice(source.indexOf('    function setDocumentBleed('),source.indexOf('    function nativeDocumentBleed('));
function fixture(reply:string|null){
 const files=new Map<string,string>();let sends=0;
 function File(this:Record<string,unknown>,path:string){Object.defineProperty(this,'exists',{get:()=>files.has(path)});Object.defineProperty(this,'length',{get:()=>files.get(path)?.length??0});this.open=()=>files.has(path);this.read=()=>files.get(path);this.close=()=>{};this.remove=()=>files.delete(path);}
 const context=vm.createContext({File,Folder:{temp:{fsName:'/fixture'}},app:{redraw:()=>{},sendScriptMessage:(name:string,selector:string)=>{sends++;expect(name).toBe('AIQNative');expect(selector).toMatch(/^bleed-set:[a-f0-9]{32}:1\.00000000,2\.00000000,3\.00000000,4\.00000000$/);if(reply!==null)files.set('/fixture/AIQNative-'+selector.split(':')[1]+'.json',reply);}}});
 vm.runInContext(`var geometryUndo={},parseJSON=JSON.parse;function documentBleed(){return [0,0,0,0];}function resultEdit(message,effects,skipped){return {message:message,sideEffects:effects||[],skipped:skipped||[],status:skipped?'partial':'completed'};}`+fn,context);
 return {act:(offsets:unknown)=>vm.runInContext('setDocumentBleed({},'+JSON.stringify({offsets})+')',context),sends:()=>sends,files,context};
}
it('validates the complete request before native writes and treats identical values as no-op',()=>{const f=fixture(null);for(const bad of [[1,2,3],[-1,2,3,4],[73,2,3,4],['1',2,3,4]])expect(()=>f.act(bad)).toThrow();expect(f.act([0,0,0,0]).status).toBe('completed');expect(f.sends()).toBe(0);});
it('returns verified points and cleans the response',()=>{const f=fixture('{"ok":true,"protocol":1,"unit":"pt","offsets":[1,2,3,4]}');const result=f.act([1,2,3,4]);expect(result.status).toBe('completed');expect(Array.from(result.bleedOffsets)).toEqual([1,2,3,4]);expect(f.files.size).toBe(0);});
it.each([null,'garbled','{"ok":false}', '{"ok":true,"protocol":1,"unit":"pt","offsets":[1,2,3,9]}'])('an uncertain write remains partial and rereads actual settings (%#)',reply=>{const f=fixture(reply);const r=f.act([1,2,3,4]);expect(r.status).toBe('partial');expect(Array.from(r.bleedOffsets)).toEqual([0,0,0,0]);expect(r.sideEffects).toContain('document-bleed');expect(vm.runInContext('geometryUndo',f.context)).toBeNull();expect(f.files.size).toBe(0);});
