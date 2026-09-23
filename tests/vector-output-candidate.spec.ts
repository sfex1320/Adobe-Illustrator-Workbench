import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {describe,it,expect} from 'vitest';

const source=readFileSync('host/experimental/direct-vector-output.jsx','utf8');
function candidate(){const context=vm.createContext({});vm.runInContext(source,context);return {
 plan:(request:unknown)=>vm.runInContext(`AIQVectorCandidate.plan(${JSON.stringify(request)})`,context),
 encode:(request:unknown)=>vm.runInContext(`AIQVectorCandidate.encode(AIQVectorCandidate.plan(${JSON.stringify(request)}),'AIQ_test')`,context),
};}
function key(name:string){return [...name].reduce((n,c)=>n*256+c.charCodeAt(0),0);}
const request={format:'pdf',path:'G:/测试输出/未保存稿.pdf',boards:[2,0],scale:100,colorMode:'source'};
describe('unreleased direct vector candidate',()=>{
 it('parses as ES3 for the ExtendScript runtime',()=>{
  expect(()=>parse(source,{ecmaVersion:3})).not.toThrow();
 });
 it('preserves requested page order and Unicode output path in the native request',()=>{
  const plan=candidate().plan(request);
  expect(plan.nativeVerified).toBe(false);
  expect(plan.event).toBe('adobe_saveACopyAs');
  expect(plan.params).toContainEqual([key('sran'),'ustring','3,1']);
  expect(plan.params).toContainEqual([key('name'),'ustring',request.path]);
  expect(candidate().encode(request).toLowerCase()).toContain(Buffer.from(request.path).toString('hex'));
 });
 it.each([[],[0,0],[-1],[0.5],[1000],['1']].map(boards=>({boards})))('refuses invalid/empty board scopes $boards',({boards})=>{
  expect(()=>candidate().plan({...request,boards})).toThrow();
 });
 it.each([{unknownOption:true},{outlineText:'false'},{embedImages:1},{compression:null},{bleed:null},{format:'ai',bleed:[0,0,0,0]},{format:'eps',compression:true},{pdfCompatible:true},{format:'ai',preserveEditability:false}])('rejects options it cannot faithfully apply %j',change=>{
  expect(()=>candidate().plan({...request,...change})).toThrow();
 });
 it.each([{scale:200},{colorMode:'cmyk'},{overprintBlack:true},{annotation:true},{format:'ai',outlineText:true},{format:'eps',outlineText:true},{outlineText:true,preserveEditability:true}])('does not silently drop unsupported preprocessing %j',change=>{
  expect(()=>candidate().plan({...request,...change})).toThrow();
 });
 it('marks the PDF flattener output as requiring an independent live-text inspection',()=>{
  const plan=candidate().plan({...request,outlineText:true});
  expect(plan.requireOutlinedTextCheck).toBe(true);
  expect(plan.nativeVerified).toBe(false);
  expect(plan.params).toContainEqual([key('fotx'),'boolean',1]);
  expect(plan.params).toContainEqual([key('rdtr'),'boolean',0]);
 });
 it('explicitly carries both AI PDF compatibility choices',()=>{
  for(const value of [false,true])expect(candidate().plan({...request,format:'ai',pdfCompatible:value}).params).toContainEqual([key('pdf '),'boolean',Number(value)]);
 });
 it('requests EPS source colors, overprints and gradients explicitly',()=>{
  const plan=candidate().plan({...request,format:'eps'});
  expect(plan.params).toContainEqual([key('cmyk'),'boolean',0]);
  expect(plan.params).toContainEqual([key('eopt'),'integer',1]);
  expect(plan.params).toContainEqual([key('cgpt'),'boolean',0]);
  expect(plan.params).toContainEqual([key('pslv'),'integer',3]);
  expect(plan.nativeVerified).toBe(false);
 });
 it.each([[1.5,0,0,0],[0,-1,0,0],[0,0,0],[0,0,0,721]])('refuses unsupported bleed rather than rounding %j',(...bleed)=>{
  expect(()=>candidate().plan({...request,bleed})).toThrow();
 });
 it('does not invoke host or file APIs while planning/encoding',()=>{
  // The VM has no app/File/Folder bindings; an accidental host call fails.
  expect(candidate().encode(request)).toContain('/showDialog 0');
 });
 it('keeps candidate code outside the production package',()=>{
  const build=readFileSync('scripts/package-cep.mjs','utf8');
  expect(build).not.toContain('direct-vector-output');
  expect(source).not.toMatch(/\.saveAs\s*\(|\.save\s*\(|documents\.add\s*\(|app\.open\s*\(/);
 });
});

describe('candidate action lifecycle (simulated host, not native evidence)',()=>{
 function run(failure:string){
  const context=vm.createContext({});
  vm.runInContext(`
   var failure=${JSON.stringify(failure)},events=[],files={},Folder={temp:'G:/fake-temp'};
   var owned={name:'AIQ_VECTOR_TEST_owned.ai',artboards:[{}]};
   var app={activeDocument:owned,loadAction:function(){events.push('load');if(failure==='load')throw Error('load failed');},
    doScript:function(){events.push('execute');if(failure==='execute')throw Error('execution failed');},
    unloadAction:function(){events.push('unload');if(failure==='unload')throw Error('unload failed');}};
   function File(path){this.path=path;this.exists=failure==='overwrite'&&path==='G:/output.pdf';}
   File.prototype.open=function(){events.push('open-action');this.exists=true;files[this.path]=true;return true;};
   File.prototype.write=function(){events.push('write-action');return failure!=='write';};
   File.prototype.close=function(){events.push('close-action');};
   File.prototype.remove=function(){events.push('remove-action');delete files[this.path];this.exists=false;return true;};
   ${source}
   var error=null,result=null;
   try{result=AIQVectorCandidate.run(owned,{format:'pdf',path:'G:/output.pdf',boards:[failure==='scope'?1:0]});}catch(e){error=e.message;}
  `,context);
  return JSON.parse(vm.runInContext('JSON.stringify({events:events,files:files,error:error,result:result})',context)) as {events:string[];files:Record<string,boolean>;error:string|null;result:{nativeVerified:boolean}|null};
 }
 it('cleans actions after a successful submission without claiming native validation',()=>{
  const result=run('');
  expect(result.error).toBeNull();expect(result.files).toEqual({});
  expect(result.events).toEqual(['open-action','write-action','close-action','load','execute','unload','remove-action']);
  expect(result.result?.nativeVerified).toBe(false);
 });
 it.each(['write','load','execute','unload'])('cleans temporary action files after %s failure',failure=>{
  const result=run(failure);expect(result.error).not.toBeNull();expect(result.files).toEqual({});
  expect(result.events.at(-1)).toBe('remove-action');
 });
 it.each(['overwrite','scope'])('refuses %s before any action or file write',failure=>{
  const result=run(failure);expect(result.error).not.toBeNull();expect(result.events).toEqual([]);
 });
});
