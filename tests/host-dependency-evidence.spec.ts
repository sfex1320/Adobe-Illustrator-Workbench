import {expect,it} from 'vitest';
// @ts-expect-error Node-only release utility.
import {hostFingerprint,assertHostEvidence,sha256,sharedCompatibilityCases,validateSharedCompatibility,sharedFunctionHashes,validateSharedChanges,assertSharedCompatibilityUnchanged} from '../scripts/host-dependency-evidence.mjs';
const source=`var AIQ=(function(){
var token=0;
function shared(){return ++token;}
function exported(){return shared();}
function text(){return 5;}
function readEditor(p){var profile=p&&p.profile||'selection',items=profile==='document'?[]:loadItems();for(var i=0;i<items.length;i++){stack(items[i]);}return shared();}
function loadItems(){return [1];}function stack(a){return a;}
function editDocument(p){var a=p.action;if(a.type==='export'){return exported();}if(a.type==='text-search'){return text();}throw Error('unsupported');}
function handle(encoded){var payload=JSON.parse(encoded),p=payload.params,command=payload.command;if(command==='GET_EDITOR_STATE')return readEditor(p);else if(command==='EDIT_DOCUMENT')return editDocument(p);throw Error('unknown');}
return {handle:handle};})();`;
const config={actions:['export'],profiles:['document']};
it('limits independent preparation evidence to its authenticated entry and all reachable helpers',()=>{
 const base=source.replace('return exported();','return exportDelivery(d,refs,cache,a);').replace('function exported()',"function prepareRasterDelivery(d,cache,a){return shared();}function exportDelivery(d,refs,cache,a){if(a.rasterEngine==='independent')return prepareRasterDelivery(d,cache,a);return 42;}function exported()");
 const independent={...config,rasterEngine:'independent'},before=hostFingerprint(base,independent).hash;
 expect(hostFingerprint(base.replace('return 42','return 43'),independent).hash).toBe(before);
 expect(hostFingerprint(base.replace('return ++token','return ++token+1'),independent).hash).not.toBe(before);
 expect(()=>hostFingerprint(base.replace("a.rasterEngine==='independent'","a.rasterEngine==='native'"),independent)).toThrow('entry changed');
 expect(()=>hostFingerprint(base.replace('return 42','var prepareRasterDelivery;return 42'),independent)).toThrow('shadowed');
});
it('canonicalizes inactive boolean guards without removing effects',()=>{
 const base=source.replace('var a=p.action;',"var a=p.action;if(p.range&&a.type!=='text-search')shared();"),before=hostFingerprint(base,config).hash;
 expect(hostFingerprint(base.replace("p.range&&a.type!=='text-search'","p.range&&a.type!=='new-feature'&&a.type!=='text-search'"),config).hash).toBe(before);
 expect(hostFingerprint(base.replace("p.range&&a.type!=='text-search'","p.touch()&&false"),config).hash).not.toBe(before);
});
it('reuses only a cryptographically verified baseline and unchanged reachable feature dependencies',()=>{
 const current=source.replace('return 5','return 99');
 expect(assertHostEvidence({host:current,baselineHost:source,expectedHash:sha256(source),config})).toMatchObject({mode:'module-equivalent'});
 expect(()=>assertHostEvidence({host:current,baselineHost:source+' ',expectedHash:sha256(source),config})).toThrow('baseline');
 expect(()=>assertHostEvidence({host:current,expectedHash:sha256(source),config})).toThrow('baseline');
});
it('detects changes to helpers, globals, dispatch guards and added initialization effects',()=>{
 const before=hostFingerprint(source,config).hash;
 for(const changed of [source.replace('++token','token+=2'),source.replace('var token=0','var token=1'),source.replace("if(a.type==='export')","if(p.allowed&&a.type==='export')"),source.replace('return {handle:handle};','dangerous();return {handle:handle};')])expect(hostFingerprint(changed,config).hash).not.toBe(before);
});
it('prunes only proven inactive dispatch and document-profile empty loops, retaining selection dependencies',()=>{
 const changed=source.replace('function stack(a){return a;}','function stack(a){throw Error("bad");}');
 expect(hostFingerprint(changed,config).hash).toBe(hostFingerprint(source,config).hash);
 const selected={actions:['export'],profiles:['selection']};expect(hostFingerprint(changed,selected).hash).not.toBe(hostFingerprint(source,selected).hash);
});
it('does not drop uncertain branches, side-effectful conditions or dynamic local dispatch',()=>{
 const guarded=source.replace('return exported();','if(expensive()&&false)return text();return exported();');
 expect(hostFingerprint(guarded,config).hash).not.toBe(hostFingerprint(source,config).hash);
 const dynamic=source.replace('return exported();','var handler=text;return handler();');
 expect(hostFingerprint(dynamic.replace('return 5','return 6'),config).hash).not.toBe(hostFingerprint(dynamic,config).hash);
});
it('ignores formatting and comments but rejects malformed or unsupported wrappers',()=>{
 expect(hostFingerprint(source.replace('return 5','/*note*/ return 5'),config).hash).toBe(hostFingerprint(source,config).hash);
 expect(()=>hostFingerprint('var x=;',config)).toThrow();
});
it('accepts only complete native shared proofs bound to old/new/suite/formal native hashes',()=>{
 const binding={baselineHash:sha256(source),currentHash:sha256(source.replace('return shared();}', 'return shared()+1;}')),suiteHash:'suite',nativeHash:'formal'};
 const report={kind:'real-illustrator-shared-compatibility',passed:true,...binding,checks:sharedCompatibilityCases.map((id:string)=>({id,passed:true}))};
 expect(validateSharedCompatibility(report,binding)).toMatchObject({baselineHash:binding.baselineHash});
 for(const changed of [{...report,passed:false},{...report,checks:report.checks.slice(1)},{...report,checks:[...report.checks,report.checks[0]]},{...report,nativeHash:'diagnostic'},{...report,suiteHash:'stale'},{...report,currentHash:'stale'},{...report,baselineHash:'unverified'}])expect(()=>validateSharedCompatibility(changed,binding)).toThrow('incomplete or stale');
 const changed=source.replace('return shared();}','return shared()+1;}');
 expect(()=>assertHostEvidence({host:changed,baselineHost:source,expectedHash:sha256(source),config,sharedProof:{baselineHash:sha256(source),currentHash:sha256(changed)}})).toThrow('native evidence');
 // Even a valid proof cannot approve an unrelated feature helper.
 expect(()=>assertHostEvidence({host:changed,baselineHost:source,expectedHash:sha256(source),config,sharedProof:validateSharedCompatibility(report,binding)})).toThrow('exported');
});
it('requires explicit review for further edits to the approved shared functions',()=>{
 const audit={before:sharedFunctionHashes(source),after:sharedFunctionHashes(source)};
 expect(()=>validateSharedChanges(source,source,audit)).not.toThrow();
 expect(()=>validateSharedChanges(source,source.replace("var profile=p&&p.profile", "mutate();var profile=p&&p.profile"),audit)).toThrow('audited');
});
it('reuses a shared report only when its full tested dependency closure is unchanged',()=>{
 expect(()=>assertSharedCompatibilityUnchanged(source,source.replace('return 5','return 9'))).not.toThrow();
 for(const changed of [source.replace('++token','token+=2'),source.replace('return shared();}\nfunction loadItems','return shared()+1;}\nfunction loadItems'),source.replace("var a=p.action;","var a=p.action;damage();"),source.replace('return {handle:handle};','damage();return {handle:handle};')])expect(()=>assertSharedCompatibilityUnchanged(source,changed)).toThrow('dependencies changed');
});
