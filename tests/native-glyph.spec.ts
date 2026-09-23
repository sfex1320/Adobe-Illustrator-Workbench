import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function fixture(mutate?:(value:Record<string,unknown>)=>unknown){
 const files=new Map<string,string>();let requests=0;
 function File(this:Record<string,unknown>,path:string){Object.defineProperty(this,'exists',{get:()=>files.has(path)});Object.defineProperty(this,'length',{get:()=>files.get(path)?.length??0});this.open=()=>files.has(path);this.read=()=>files.get(path);this.close=()=>{};this.remove=()=>files.delete(path);}
 const context=vm.createContext({TextType:{POINTTEXT:1,AREATEXT:2,PATHTEXT:3},File,Folder:{temp:{fsName:'/temp'}},app:{sendScriptMessage:(name:string,selector:string)=>{requests++;expect(name).toBe('AIQNative');expect(selector).toMatch(/^glyph-file:[0-9a-f]{32}:0,0;1,0$/);const value={ok:true,protocol:1,unit:'pt',method:'dictionary-outline',items:[{story:0,frame:0,sourceBounds:[0,40,30,0],bounds:[1,35,29,2]},{story:1,frame:0,sourceBounds:[50,40,80,0],bounds:[51,35,79,2]}]};files.set('/temp/AIQNative-'+selector.slice(11,43)+'.json',JSON.stringify(mutate?mutate(value):value));}}});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {nativeGlyphBounds:nativeGlyphBounds,measureLayout:measureLayout};'),context);
 vm.runInContext("var first={typename:'TextFrame',uuid:'a',contents:'ABC',visibleBounds:[0,40,30,0]},second={typename:'TextFrame',uuid:'b',contents:'DEF',visibleBounds:[50,40,80,0]},doc={stories:[{textFrames:[first]},{textFrames:[second]}]};",context);
 return {run:()=>vm.runInContext("AIQ.measureLayout(doc,[{item:first},{item:second}],{text:'glyph',clip:'visible'});",context),files,count:()=>requests,context};
}
it('measures both texts in one native request without creating a document',()=>{const f=fixture(),r=f.run();expect(r.measuredObjects.map((o:{bounds:number[]})=>Array.from(o.bounds))).toEqual([[1,-35,29,-2],[51,-35,79,-2]]);expect(f.count()).toBe(1);expect(f.files.size).toBe(0);});
it.each([
 (v:Record<string,unknown>)=>({...v,ok:false,error:'STALE_TARGET'}),
 (v:Record<string,unknown>)=>({...v,protocol:2}),
 (v:Record<string,unknown>)=>({...v,items:[]}),
 (v:Record<string,unknown>)=>({...v,items:[...(v.items as unknown[])].reverse()}),
 (v:Record<string,unknown>)=>({...v,items:(v.items as Record<string,unknown>[]).map(x=>({...x,sourceBounds:[999,40,30,0]}))}),
 (v:Record<string,unknown>)=>({...v,items:(v.items as Record<string,unknown>[]).map(x=>({...x,bounds:[30,40,0,0]}))}),
])('rejects invalid/changed native results and removes reply (%#)',change=>{const f=fixture(change);expect(()=>f.run()).toThrow();expect(f.files.size).toBe(0);});
it('does not widen an empty or stale target to all document text',()=>{const f=fixture();expect(()=>vm.runInContext("AIQ.measureLayout(doc,[],{text:'glyph',clip:'visible'});",f.context)).toThrow();vm.runInContext('doc.stories=[];',f.context);expect(()=>f.run()).toThrow();expect(f.count()).toBe(0);});
