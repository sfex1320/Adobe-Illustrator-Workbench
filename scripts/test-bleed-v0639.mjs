import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {connect} from './production-stress-bridge.mjs';
const source=await fs.readFile('host/cep/com.aiq.workbench/hostscript.jsx','utf8'),bridge=connect(),checks=[];
const dir=path.resolve('artifacts/bleed-v0639-'+Date.now()).replaceAll('\\','/');await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/hostscript.jsx',source);
const host=async code=>{const r=await bridge.host(`try{${code}}catch(B39E){'ERROR39:'+String(B39E)+' line '+B39E.line;}`);if(r.startsWith('ERROR39:')||r==='EvalScript error.')throw Error(r);return r;};
let owned=false;
try{
 await host(source.replace('var AIQ =','var B39 =')+";'loaded';");
 await host("var B39PREV=app.documents.length?app.activeDocument:null,B39DOC=null;function B39RPC(command,params){return eval('('+B39.handle(encodeURIComponent(B39.stringify({id:'bleed39',command:command,params:params||{}})))+')');}function B39ACT(action){var s=B39RPC('GET_EDITOR_STATE',{profile:'document'}).data;return B39RPC('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:action});} 'ready';");
 for(const mode of ['unsaved','clean','dirty']){
  await host(`B39DOC=app.documents.add(DocumentColorSpace.RGB,200,150);var B39P=B39DOC.pathItems.rectangle(100,20,40,30);B39P.selected=true;if('${mode}'!=='unsaved')B39DOC.saveAs(new File(${JSON.stringify(dir+'/'+mode+'.ai')}));if('${mode}'==='dirty')B39P.translate(2,3);'fixture';`);owned=true;
  const r=JSON.parse(await host(`var original=B39ACT({type:'read-bleed'}).data.bleedOffsets,before={bounds:String(B39P.geometricBounds),count:B39DOC.pageItems.length,selection:B39P.selected,center:String(B39DOC.views[0].centerPoint),zoom:B39DOC.views[0].zoom,docs:app.documents.length};var write=B39ACT({type:'set-bleed',offsets:[1,2,3,4]});var savedAfter=B39DOC.saved;var read=B39ACT({type:'read-bleed'}).data.bleedOffsets;app.undo();var undone=B39ACT({type:'read-bleed'}).data.bleedOffsets;app.redo();var redone=B39ACT({type:'read-bleed'}).data.bleedOffsets;var after={bounds:String(B39P.geometricBounds),count:B39DOC.pageItems.length,selection:B39P.selected,center:String(B39DOC.views[0].centerPoint),zoom:B39DOC.views[0].zoom,docs:app.documents.length};B39.stringify({write:write,read:read,original:original,undone:undone,redone:redone,savedAfter:savedAfter,before:before,after:after});`));
  checks.push({name:mode+' four sides read back',passed:r.write.data.status==='completed'&&JSON.stringify(r.read)==='[1,2,3,4]',detail:r});
  checks.push({name:mode+' undo and redo document bleed',passed:JSON.stringify(r.undone)===JSON.stringify(r.original)&&JSON.stringify(r.redone)==='[1,2,3,4]'});
  checks.push({name:mode+' source geometry selection view protected',passed:JSON.stringify(r.before)===JSON.stringify(r.after)&&r.savedAfter===false});
  console.log(mode,checks.slice(-3).map(c=>c.passed));
  await host("B39DOC.close(SaveOptions.DONOTSAVECHANGES);B39DOC=null;'closed';");owned=false;
 }
}finally{
 if(owned)await host("B39DOC.close(SaveOptions.DONOTSAVECHANGES);B39DOC=null;'closed';");await host("if(B39PREV)B39PREV.activate();'restored';");bridge.close();
 const hash=b=>createHash('sha256').update(b).digest('hex');const report={passed:checks.length===9&&checks.every(c=>c.passed),sourceSha256:hash(source),nativeSha256:hash(await fs.readFile('artifacts/native/AIQNative.aip')),testSha256:hash(await fs.readFile(import.meta.filename)),directory:dir,checks};await fs.writeFile('docs/review/bleed-v0639-native.json',JSON.stringify(report,null,2));console.log('Passed:',report.passed);if(!report.passed)process.exitCode=1;
}
