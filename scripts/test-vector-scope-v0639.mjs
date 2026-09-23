import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {connect} from './production-stress-bridge.mjs';
const source=await fs.readFile('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const run=process.argv[2]||'current',directory=path.resolve('artifacts/vector-v0639',run+'-'+Date.now());
await fs.mkdir(directory,{recursive:true});
await fs.writeFile(path.join(directory,'hostscript.jsx'),source);
const bridge=connect(),checks=[];
const host=async code=>{const r=await bridge.host(`try{${code}}catch(V39E){'ERROR39:'+String(V39E)+' line '+V39E.line;}`);if(r.startsWith('ERROR39:')||r==='EvalScript error.')throw Error(r);return r;};
let owned=false;
try{
 await host(source.replace('var AIQ =','var V39 =')+"; 'loaded';");
 await host(`var V39PREV=app.documents.length?app.activeDocument:null,V39DOC=app.documents.add(DocumentColorSpace.RGB,200,200);V39DOC.artboards[0].artboardRect=[0,200,200,0];V39DOC.artboards.add([300,200,500,0]);function V39RECT(parent,name,x){var p=parent.pathItems.rectangle(160,x,40,40);p.name=name;p.stroked=false;var c=new RGBColor();c.red=200;c.green=30;c.blue=20;p.fillColor=c;return p;}var V39INSIDE=V39RECT(V39DOC.layers[0],'inside',20);var V39OUT=V39DOC.layers[0].groupItems.add();V39OUT.name='outside-group';V39RECT(V39OUT,'outside-child',320);var V39CROSS=V39DOC.layers[0].groupItems.add();V39CROSS.name='cross-group';V39RECT(V39CROSS,'cross-inside',100);V39RECT(V39CROSS,'cross-outside',400);var V39SPAN=V39RECT(V39DOC.layers[0],'span',180);V39SPAN.top=100;V39SPAN.width=200;V39SPAN.height=20;var V39HIDE=V39DOC.layers.add();V39HIDE.name='hidden-layer';V39RECT(V39HIDE,'hidden-inside',30);V39RECT(V39HIDE,'hidden-outside',330);V39HIDE.visible=false;V39HIDE.locked=true;function V39ORDER(item){var items=item.parent.pageItems;for(var i=0;i<items.length;i++)if(items[i]===item)return i;throw Error('Object not found in parent');}function V39RPC(command,params){return eval('('+V39.handle(encodeURIComponent(V39.stringify({id:'vector39',command:command,params:params||{}})))+')');} 'ready';`);owned=true;
 const result=JSON.parse(await host(`var state=V39RPC('GET_EDITOR_STATE',{profile:'document'}).data;var before={saved:V39DOC.saved,count:V39DOC.pageItems.length,boards:V39DOC.artboards.length};var result=V39RPC('EDIT_DOCUMENT',{docSessionId:state.docSessionId,token:state.token,action:{type:'export',target:'artboards',artboardIndexes:[0],format:'ai',scale:100,resolution:72,colorMode:'source',folder:${JSON.stringify(directory.replaceAll('\\','/'))},fileName:'single',allArtboards:false,pdfCompatible:false}});V39.stringify({result:result,before:before,after:{saved:V39DOC.saved,count:V39DOC.pageItems.length,boards:V39DOC.artboards.length}});`));
 checks.push({name:'export completed',passed:result.result.ok&&result.result.data.status==='completed',detail:result.result});
 checks.push({name:'source unchanged',passed:JSON.stringify(result.before)===JSON.stringify(result.after),before:result.before,after:result.after});
 const files=result.result.data?.files||[];
 if(files.length){
  const opened=JSON.parse(await host(`var opened=app.open(new File(${JSON.stringify(directory.replaceAll('\\','/')+'/'+files[0])}));var names=[];for(var i=0;i<opened.pageItems.length;i++)names.push(String(opened.pageItems[i].name));var observed={names:names,boards:opened.artboards.length};opened.close(SaveOptions.DONOTSAVECHANGES);V39DOC.activate();V39.stringify(observed);`));
  checks.push({name:'no unselected artwork in reopened AI',passed:!opened.names.includes('outside-child')&&!opened.names.includes('cross-outside')&&!opened.names.includes('hidden-outside'),detail:opened});
  checks.push({name:'hidden selected content remains in hidden layer',passed:opened.names.includes('hidden-inside')});
  checks.push({name:'selected artwork retained',passed:opened.names.includes('inside')&&opened.names.includes('cross-inside')});
 }
 for(const target of ['artboards','objects'])for(const format of (process.env.AIQ_VECTOR_FORMATS||'ai,svg,pdf,eps').split(',')){
  const collection=JSON.parse(await host(`V39DOC.activate();V39DOC.selection=null;if('${target}'==='objects'){V39INSIDE.selected=true;V39OUT.selected=true;}var s=V39RPC('GET_EDITOR_STATE',{profile:'${target==='objects'?'selection':'document'}'}).data;var r=V39RPC('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:{type:'export',target:'${target}',collection:true,artboardIndexes:[1,0],format:'${format}',scale:100,resolution:72,colorMode:'source',folder:${JSON.stringify(directory.replaceAll('\\','/'))},fileName:'collection-${target}-${format}',allArtboards:false,pdfCompatible:false}});V39.stringify(r);`));
  checks.push({name:`${target} ${format} collection produces one file`,passed:collection.ok&&collection.data.status==='completed'&&collection.data.files.length===1,detail:collection});
  if(collection.data.files?.length&&format==='ai'){
   const reopened=JSON.parse(await host(`var opened=app.open(new File(${JSON.stringify(directory.replaceAll('\\','/')+'/')}+${JSON.stringify(collection.data.files[0])}));var positions={},boards=[];for(var n=0;n<opened.pageItems.length;n++){var it=opened.pageItems[n];if(it.name==='inside'||it.name==='outside-child')positions[String(it.name)]=it.geometricBounds;}for(var n=0;n<opened.artboards.length;n++)boards.push(opened.artboards[n].artboardRect);var below=null;try{below=V39ORDER(opened.pageItems.getByName('inside'))<V39ORDER(opened.pageItems.getByName('outside-group'));}catch(noOrder){}var result={positions:positions,boards:boards,below:below,sourceBelow:V39ORDER(V39INSIDE)<V39ORDER(V39OUT)};opened.close(SaveOptions.DONOTSAVECHANGES);V39DOC.activate();V39.stringify(result);`));
   checks.push({name:`${target} AI collection keeps relative positions`,passed:Math.abs(reopened.positions['outside-child'][0]-reopened.positions.inside[0]-300)<.01,detail:reopened});
   if(target==='objects')checks.push({name:'Object collection preserves stacking order',passed:reopened.below===reopened.sourceBelow,detail:reopened});
   if(target==='artboards')checks.push({name:'AI collection preserves both selected artboards',passed:reopened.boards.length===2&&Math.abs(reopened.boards[0][0]-reopened.boards[1][0]-300)<.01});
  }
 }
}catch(error){checks.push({name:'run completed',passed:false,detail:error.message});process.exitCode=1;}finally{
 if(owned)try{await host("V39DOC.activate();V39DOC.close(SaveOptions.DONOTSAVECHANGES);if(V39PREV)V39PREV.activate();'closed';");}catch(error){checks.push({name:'owned fixture cleanup',passed:false,detail:error.message});}
 bridge.close();
 const report={passed:checks.length>=4&&checks.every(c=>c.passed),sourceSha256:createHash('sha256').update(source).digest('hex'),directory,checks};
 await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,directory,checks:checks.length,failures:checks.filter(c=>!c.passed)},null,2));if(!report.passed)process.exitCode=1;
}
