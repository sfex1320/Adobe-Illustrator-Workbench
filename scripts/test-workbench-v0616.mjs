import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {sha256,directExportSuiteHash} from './direct-export-evidence.mjs';
const originalSource=await readFile(process.env.AIQ_TEST_HOSTSCRIPT||'host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const testSuiteSha256=await directExportSuiteHash(process.cwd());
const server=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/editor-test-bridge.ps1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
let pending;createInterface({input:server.stdout}).on('line',line=>{if(pending){const p=pending;pending=null;p.resolve(Buffer.from(line,'base64').toString('utf8'));}});
server.on('exit',()=>pending?.reject(Error('Native bridge exited')));
const host=script=>new Promise((resolve,reject)=>{pending={resolve,reject};server.stdin.write(encodeURIComponent(script)+'\n');});
const checks=[],outputs=[];
function check(name,passed,detail){checks.push({name,passed:!!passed,detail});console.log(name+': '+passed);if(!passed)throw Error(name+': '+JSON.stringify(detail));}
const rpc=async(command,params={})=>{const r=JSON.parse(await host(`if(app.activeDocument!==AIQ_C16_DOC)throw Error('Test document changed');AIQ_C16.handle(${JSON.stringify(encodeURIComponent(JSON.stringify({id:'test',command,params})))})`));if(!r.ok)throw Error(r.error.message);return r.data;};
const folder=process.cwd().replaceAll('\\','/')+'/artifacts/v0616-'+Date.now();
try{
 await mkdir(folder,{recursive:true});
 let source=originalSource.replace('var AIQ =','var AIQ_C16 =');
 // BridgeTalk bodies execute in Photoshop, where these Illustrator counters do
 // not exist. Preserve the complete assignment and instrument only host code.
 source=source.split('\n').map(line=>/^\s*bt\.body=/.test(line)?line:line.replaceAll('app.documents.add(','AIQ_C16_add(').replace(/\b(\w+)\.saveAs\(/g,'AIQ_C16_saveAs($1,').replace(/\b(\w+)\.save\(\)/g,'AIQ_C16_save($1)')).join('\n');
 // Inject only the timing of a real cancellation file: after the first completed
 // page. The production cancellation/cleanup code still handles the request.
 source=source.replace('done:function(index){state.completedIndexes.push(index);',"done:function(index){state.completedIndexes.push(index);if(AIQ_C16_CANCEL_TEST){AIQ_C16_CANCEL_TEST=false;cancel.open('w');cancel.write('cancel');cancel.close();}");
 source=source.replace('function deliveryAction(event,params){',"function deliveryAction(event,params){if(event==='adobe_saveACopyAs')AIQ_C16_counts.copies++;");
 await host(source+`
var AIQ_C16_PREVIOUS=app.documents.length?app.activeDocument:null,AIQ_C16_counts={adds:0,saves:0,copies:0};
function AIQ_C16_add(space,w,h){AIQ_C16_counts.adds++;return app.documents.add(space,w,h);}
function AIQ_C16_saveAs(d,f,o){AIQ_C16_counts.saves++;return d.saveAs(f,o);}
function AIQ_C16_save(d){AIQ_C16_counts.saves++;return d.save();}
var AIQ_C16_DOC=null,AIQ_C16_CANCEL_TEST=false;
function fixture(cmyk){
 var d=app.documents.add(cmyk?DocumentColorSpace.CMYK:DocumentColorSpace.RGB,144,72);AIQ_C16_DOC=d;d.rulerUnits=RulerUnits.Points;
 var effects=d.rasterEffectSettings;effects.resolution=144;d.rasterEffectSettings=effects;
 d.artboards[0].name='Wide';d.artboards.add([240,108,312,0]);d.artboards[1].name='Tall';
 for(var i=0;i<2;i++){var b=d.artboards[i].artboardRect,p=d.pathItems.rectangle(b[1],b[0],b[2]-b[0],b[1]-b[3]),c=cmyk?new CMYKColor():new RGBColor();
 if(cmyk){c.cyan=i?100:0;c.magenta=i?0:100;c.yellow=100;c.black=0;}else{c.red=i?0:255;c.green=i?255:0;c.blue=0;}
 p.filled=true;p.fillColor=c;p.stroked=false;p.name='Color'+i;
 var t=d.textFrames.add();t.contents='Board '+(i+1);t.position=[b[0]+5,b[1]-5];t.textRange.characterAttributes.size=10;
 // Visible clipped content plus hidden overflow: catches native board/clip leakage.
 var group=d.groupItems.add(),paint=group.pathItems.rectangle(b[1]-20,b[2]-30,70,15),blue=new RGBColor();blue.blue=255;blue.red=0;blue.green=0;paint.fillColor=blue;paint.stroked=false;
 var mask=group.pathItems.rectangle(b[1]-20,b[2]-30,10,10);mask.filled=false;mask.stroked=false;mask.clipping=true;group.clipped=true;
 }
 var hidden=d.textFrames.add();hidden.contents='HIDDEN_MARKER';hidden.position=[10,35];hidden.hidden=true;
 d.selection=null;t.selected=true;d.artboards.setActiveArtboardIndex(1);return 'ready';
}
function snapshot(){var d=AIQ_C16_DOC,boards=[],items=[],selection=[];for(var i=0;i<d.artboards.length;i++)boards.push(String(d.artboards[i].artboardRect));for(i=0;i<d.pageItems.length;i++){var p=d.pageItems[i],style='';if(p.typename==='PathItem'){var c=p.fillColor;style=':'+p.filled+':'+p.stroked+':'+p.strokeWidth+':'+c.typename+':'+[c.red,c.green,c.blue,c.cyan,c.magenta,c.yellow,c.black].join(',');}items.push(p.typename+':'+String(p.geometricBounds)+':'+p.hidden+':'+p.locked+':'+p.opacity+style+(p.typename==='TextFrame'?':'+p.contents:''));}for(i=0;i<d.selection.length;i++)selection.push(d.selection[i].uuid);
return AIQ_C16.stringify({saved:d.saved,name:d.name,docs:app.documents.length,boards:boards,items:items,selection:selection,board:d.artboards.getActiveArtboardIndex(),center:d.views[0].centerPoint,zoom:d.views[0].zoom,resolution:d.rasterEffectSettings.resolution,color:String(d.documentColorSpace)});}
'loaded';`);
 for(const mode of ['RGB','CMYK']){
  check(mode+' owned fixture',await host('fixture('+String(mode==='CMYK')+');')==='ready');
  // A dirty unsaved fixture cannot detect exporters that silently dirty clean documents.
  await host(`AIQ_C16_DOC.saveAs(new File(${JSON.stringify(folder)}+'/'+${JSON.stringify(mode)}+'-seed.ai'));'saved test seed';`);
  const before=await host('snapshot();');
  const cases=[['svg','rgb',200,true],['svg','rgb',50,true],['svg','rgb',100,false],['jpeg','cmyk',100,false],['jpeg','cmyk',200,false],['jpeg','cmyk',50,false],['jpeg','rgb',200,false],['png','rgb',200,false],['tif','cmyk',100,false]];
  for(const [format,colorMode,scale,outlineText] of cases){
   const s=await rpc('GET_EDITOR_STATE',{profile:'selection'}),name=mode+'-'+format+'-'+colorMode+'-'+scale;
   const result=await rpc('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:{type:'export',target:'artboards',artboardIndexes:[1,0],format,colorMode,scale,outlineText,folder,fileName:name,resolution:144,useDocumentBleed:false}});
   if(format==='tif'&&colorMode==='cmyk'&&mode==='RGB'){check(name+' unsafe native route rejected before source mutation',result.status==='failed'&&result.error?.message.includes('暂时停用')&&before===await host('snapshot();'),result);continue;}
   const crossColor=format==='jpeg'&&colorMode==='cmyk'&&mode==='RGB';
   check(name+' source-safe export with declared copy count',result.status==='completed'&&result.files.length===2&&result.exportMetrics.directPages===(crossColor?0:2)&&result.exportMetrics.workingDocuments===(crossColor?1:0),result);
   const after=await host('snapshot();'),beforeData=JSON.parse(before),afterData=JSON.parse(after),changes={};for(const key of Object.keys(beforeData))if(JSON.stringify(beforeData[key])!==JSON.stringify(afterData[key]))changes[key]={before:beforeData[key],after:afterData[key]};
   check(name+' original geometry, selection, view and saved state unchanged',before===after,changes);
   result.files.forEach((f,i)=>outputs.push({file:folder+'/'+f,format,colorMode,scale,outlineText,sourceMode:mode,board:i===0?'Tall':'Wide',expectedSize:(i===0?[72,108]:[144,72]).map(v=>v*2*scale/100),physicalSize:(i===0?[72,108]:[144,72]).map(v=>v*scale/100)}));
  }
  for(const format of ['png','jpeg']){
   const s=await rpc('GET_EDITOR_STATE',{profile:'selection'}),name=mode+'-screen-'+format;
   const r=await rpc('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:{type:'export',target:'artboards',screenExport:true,artboardIndexes:[1,0],format,colorMode:'rgb',scale:100,folder,fileName:name,resolution:72,quality:80}});
   check(name+' 72 PPI screen output, explicit cross-color copy count',r.status==='completed'&&r.files.length===2&&r.exportMetrics.screenBatches===1&&r.exportMetrics.workingDocuments===0,r);
   check(name+' source including effects and clean flag unchanged',before===await host('snapshot();'));
   r.files.forEach((f,i)=>outputs.push({file:folder+'/'+f,format,colorMode:'rgb',scale:100,sourceMode:mode,board:i===0?'Tall':'Wide',ppi:72,expectedSize:i===0?[72,108]:[144,72]}));
  }
  await host("AIQ_C16_DOC.artboards[0].name='Same';AIQ_C16_DOC.artboards[1].name='Same';'duplicate names';");
  const duplicateBefore=await host('snapshot();'),ds=await rpc('GET_EDITOR_STATE',{profile:'selection'});
  const dr=await rpc('EDIT_DOCUMENT',{docSessionId:ds.docSessionId,token:ds.token,action:{type:'export',target:'artboards',artboardIndexes:[1,0],format:'png',colorMode:'rgb',scale:100,folder,fileName:mode+'-duplicate',resolution:144}});
  check(mode+' duplicate board names map through isolated outputs',dr.status==='completed'&&dr.files.length===2&&dr.exportMetrics.screenBatches===2,dr);
  check(mode+' duplicate name source unchanged',duplicateBefore===await host('snapshot();'));
  dr.files.forEach((f,i)=>outputs.push({file:folder+'/'+f,format:'png',colorMode:'rgb',scale:100,sourceMode:mode,board:i===0?'Tall':'Wide',expectedSize:i===0?[144,216]:[288,144]}));
  await host("AIQ_C16_DOC.artboards[0].name='Wide';AIQ_C16_DOC.artboards[1].name='Tall';AIQ_C16_CANCEL_TEST=true;'cancel armed';");
  const cancelBefore=await host('snapshot();'),tempBefore=await host("String(Folder.temp.getFiles('AIQ_screen_*').length);"),cs=await rpc('GET_EDITOR_STATE',{profile:'selection'});
  const cr=await rpc('EDIT_DOCUMENT',{docSessionId:cs.docSessionId,token:cs.token,action:{type:'export',target:'artboards',jobId:'c16-cancel-'+mode+'-'+Date.now(),artboardIndexes:[1,0],format:'png',colorMode:'rgb',scale:100,folder,fileName:mode+'-cancel',resolution:144}});
  check(mode+' cancel retains only completed page, no later publish',cr.status==='partial'&&cr.files.length===1&&cr.exportProgress.status==='cancelled'&&cr.exportMetrics.screenBatches===1,cr);
  check(mode+' cancel cleans encoded batch and preserves source',cancelBefore===await host('snapshot();')&&tempBefore===await host("String(Folder.temp.getFiles('AIQ_screen_*').length);"));
  cr.files.forEach(f=>outputs.push({file:folder+'/'+f,format:'png',colorMode:'rgb',scale:100,sourceMode:mode,board:'Tall',expectedSize:[144,216]}));
  check(mode+' only declared cross-color working documents, zero source saves/snapshots',await host('String(AIQ_C16_counts.adds==='+(mode==='RGB'?3:0)+'&&AIQ_C16_counts.saves===0&&AIQ_C16_counts.copies===0);')==='true');
  await host('AIQ_C16_counts.adds=0;AIQ_C16_counts.saves=0;AIQ_C16_counts.copies=0;"reset per-mode counters";');
  const itemCount=await host('String(AIQ_C16_DOC.pageItems.length);');
  await host("var C16_MARK=AIQ_C16_DOC.pathItems.rectangle(40,20,9,7);C16_MARK.name='AIQ undo marker';'marker';");
  for(const format of ['png','jpeg','svg']){
   const s=await rpc('GET_EDITOR_STATE',{profile:'selection'});
   const r=await rpc('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:{type:'export',target:'artboards',artboardIndexes:[0],format,colorMode:'rgb',scale:100,outlineText:format==='svg',folder,fileName:mode+'-undo-'+format,resolution:144}});
   check(mode+' '+format+' after-edit output',r.status==='completed',r.error);
  }
  await host("app.undo();'undone';");
  check(mode+' export leaves user undo step intact',await host("String(AIQ_C16_DOC.pageItems.length);")===itemCount);
  await host("app.redo();'redone';");
  check(mode+' redo restores user edit',await host("String(AIQ_C16_DOC.pageItems.length);")===String(Number(itemCount)+1));
  await host('AIQ_C16_counts.adds=0;AIQ_C16_counts.saves=0;AIQ_C16_counts.copies=0;"reset undo-case counters";');
  await host("AIQ_C16_DOC.close(SaveOptions.DONOTSAVECHANGES);AIQ_C16_DOC=null;'closed';");
 }
}catch(e){checks.push({name:'run',passed:false,detail:e.message});process.exitCode=1;}
finally{
 await host("if(AIQ_C16_DOC){AIQ_C16_DOC.close(SaveOptions.DONOTSAVECHANGES);AIQ_C16_DOC=null;}'closed owned fixture';");
 await host("if(AIQ_C16_PREVIOUS)AIQ_C16_PREVIOUS.activate();'restored';");
 server.stdin.end();await writeFile('docs/review/v0616-native.json',JSON.stringify({passed:checks.every(c=>c.passed),sourceSha256:sha256(originalSource),testSuiteSha256,kind:'Real Illustrator COM; independently saved clean fixtures; not mouse gesture acceptance',checks,outputs},null,2));console.log(JSON.stringify(checks,null,2));
}
