import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const functions=source.slice(source.indexOf('    function nativeDocumentBleed(){'),source.indexOf('    // Illustrator 30 uses'));
function fixture(reply:string|null){
 const files=new Map<string,string>();let requests=0;
 function File(this:Record<string,unknown>,path:string){
  Object.defineProperty(this,'exists',{get:()=>files.has(path)});
  Object.defineProperty(this,'length',{get:()=>files.get(path)?.length??0});
  this.open=()=>files.has(path);this.read=()=>files.get(path);this.close=()=>{};this.remove=()=>files.delete(path);
 }
 const context=vm.createContext({File,Folder:{temp:{fsName:'/isolated-temp'}},app:{sendScriptMessage:(name:string,selector:string)=>{
  requests++;expect(name).toBe('AIQNative');expect(selector).toMatch(/^bleed-file:[0-9a-f]{32}$/);
  if(reply===null)throw Error('Module absent');files.set('/isolated-temp/AIQNative-'+selector.slice(11)+'.json',reply);
 }}});
 vm.runInContext('var parseJSON=JSON.parse,lastBleedReadMethod="";'+functions,context);
 return {read:(saved=false)=>vm.runInContext(`documentBleed({saved:${saved},get fullName(){throw Error('Must not read disk after native success');}})`,context),files,count:()=>requests};
}
it('dirty and saved documents both prefer live native values; no IPC replies remain',()=>{
 const f=fixture('{"ok":true,"protocol":1,"unit":"pt","offsets":[0,2.125,4.5,6]}');
 expect(Array.from(f.read())).toEqual([0,2.125,4.5,6]);expect(Array.from(f.read(true))).toEqual([0,2.125,4.5,6]);
 expect(f.count()).toBe(2);expect(f.files.size).toBe(0);
});
it.each([
 null,'bad json','{"ok":false,"error":"NO_DOCUMENT"}',
 '{"ok":true,"protocol":2,"unit":"pt","offsets":[0,0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"mm","offsets":[0,0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"pt","offsets":[0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"pt","offsets":[-1,0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"pt","offsets":["2",0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"pt","offsets":[1e999,0,0,0]}',
 '{"ok":true,"protocol":1,"unit":"pt","offsets":[721,0,0,0]}',
 ' '.repeat(2049),
])('invalid/missing native reply fails without inventing bleed and is cleaned (%#)',reply=>{
 const f=fixture(reply);expect(()=>f.read()).toThrow('原生出血模块不可用');expect(f.files.size).toBe(0);
});
