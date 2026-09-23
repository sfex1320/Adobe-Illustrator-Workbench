import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from './production-stress-bridge.mjs';
const {host,close}=connect(),checks=[];
const original=await readFile('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const plugin=process.env.AIQ_GLYPH_PLUGIN||'AIQNative';
const hash=value=>createHash('sha256').update(value).digest('hex');
const suiteHash=hash(await readFile(new URL(import.meta.url)));
const nativeBinaryHash=hash(await readFile((process.env.AIQ_NATIVE_PLUGIN_DIR||'F:/adobe/up/Adobe Illustrator 2026/Plug-ins')+'/'+plugin+'.aip'));
const folder=process.cwd().replaceAll('\\','/')+'/artifacts/glyph-native-'+Date.now();await mkdir(folder,{recursive:true});
const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,detail});assert.ok(passed,name+': '+JSON.stringify(detail));};
async function rpc(command,params){const r=JSON.parse(await host(`if(app.activeDocument!==G19_DOC)throw Error('Fixture changed');G19.handle(${JSON.stringify(encodeURIComponent(JSON.stringify({id:'glyph19',command,params})))})`));assert.ok(r.ok,JSON.stringify(r.error));if(r.data?.status==='failed')throw Error(JSON.stringify(r.data));return r.data;}
async function measure(){const s=await rpc('GET_EDITOR_STATE',{profile:'selection'});if(!s.objects?.length)throw Error('Empty selected fixture: '+await host('String(G19_DOC.selection.length)+"/"+String(G19_TEXT.selected);'));return rpc('EDIT_DOCUMENT',{docSessionId:s.docSessionId,token:s.token,action:{type:'measure-layout',clip:'visible',text:'glyph'}});}
try{
 let source=original.replace('var AIQ =','var G19 =').replaceAll("'AIQNative'",JSON.stringify(plugin)).replaceAll('app.documents.add(','G19_NO_DOCUMENT(').replaceAll('app.sendScriptMessage(','G19_send(');
 await host(source+"\nvar G19_CALLS=0;function G19_send(n,s,p){if(s.indexOf('glyph-file:')===0)G19_CALLS++;return app.sendScriptMessage(n,s,p);}function G19_NO_DOCUMENT(){throw Error('Implicit working document prohibited');}var G19_PREV=app.documents.length?app.activeDocument:null,G19_DOC=null,G19_TEXT=null;'ready';");
 for(const label of (process.env.AIQ_GLYPH_CASES?process.env.AIQ_GLYPH_CASES.split(','):['point','area','area-rotated','point-stroked','point-mixed','path','area-vertical','mixed-fonts','area-threaded'])){
  const make=label.startsWith('area')?"var p=G19_DOC.pathItems.rectangle(220,30,300,180);G19_TEXT=G19_DOC.textFrames.areaText(p);":label==='path'?"var p=G19_DOC.pathItems.add();p.setEntirePath([[30,150],[150,190],[280,100]]);G19_TEXT=G19_DOC.textFrames.pathText(p);":"G19_TEXT=G19_DOC.textFrames.add();G19_TEXT.position=[30,300];";
  await host(`app.selectTool('Adobe Select Tool');G19_DOC=app.documents.add(DocumentColorSpace.RGB,500,400);${make}G19_TEXT.contents='Hello gy AV fi';G19_TEXT.textRange.characterAttributes.size=36;
  ${label.endsWith('rotated')?'G19_TEXT.rotate(23);':''}
  ${label.endsWith('stroked')?'var c=new RGBColor();c.red=200;G19_TEXT.textRange.characterAttributes.strokeColor=c;G19_TEXT.textRange.characterAttributes.strokeWeight=2;':''}
  ${label.endsWith('mixed')?'G19_TEXT.characters[0].characterAttributes.size=52;G19_TEXT.characters[1].characterAttributes.horizontalScale=145;':''}
  ${label.endsWith('vertical')?'G19_TEXT.orientation=TextOrientation.VERTICAL;':''}
  ${label==='area-threaded'?"var linked=G19_DOC.textFrames.areaText(G19_DOC.pathItems.rectangle(220,350,120,180));G19_TEXT.nextFrame=linked;var words='';for(var wi=0;wi<35;wi++)words+='Linked words ';G19_TEXT.contents=words;":''}
  ${label==='mixed-fonts'?"G19_TEXT.contents='汉字 AV fi';G19_TEXT.characters[3].characterAttributes.textFont=app.textFonts[1];":''}
  var dup=G19_TEXT.duplicate(),outline=dup.createOutline(),G19_REF=String(outline.visibleBounds);outline.remove();G19_DOC.selection=null;G19_TEXT.selected=true;
  var opt=new IllustratorSaveOptions();opt.pdfCompatible=false;G19_DOC.saveAs(new File(${JSON.stringify(folder+'/'+label+'.ai')}),opt);
  G19_DOC.selection=null;G19_TEXT.selected=true;app.redraw();
  function g19state(){var d=G19_DOC;return [d.saved,d.pageItems.length,d.stories.length,d.textFrames.length,app.documents.length,d.selection[0].uuid,String(G19_TEXT.geometricBounds),G19_TEXT.contents,d.views[0].zoom,String(d.views[0].centerPoint)].join('|');}'fixture';`);
  const before=await host('g19state();'),ref=(await host('G19_REF;')).split(',').map(Number);
  for(let rep=0;rep<3;rep++){
   const start=Date.now(),result=await measure(),b=result.measuredObjects[0].bounds;
   const expected=[ref[0],-ref[1],ref[2],-ref[3]],delta=Math.max(...b.map((v,i)=>Math.abs(v-expected[i])));
   check(label+' accuracy '+rep,result.status==='completed'&&delta<0.005,{delta,elapsedMs:Date.now()-start});
   check(label+' source unchanged '+rep,before===await host('g19state();'));
  }
  // Probe both undo and redo transactions across a read-only measurement.
  await host("G19_TEXT.translate(10,0);'moved';");
  const moved=await host('String(G19_TEXT.geometricBounds);');
  await measure();await host("app.undo();'undone';");
  const undone=await host('String(G19_TEXT.geometricBounds);');check(label+' undo preserved',undone!==moved);
  await measure();await host("app.redo();'redone';");check(label+' redo preserved',moved===await host('String(G19_TEXT.geometricBounds);'));
  await host("G19_DOC.close(SaveOptions.DONOTSAVECHANGES);G19_DOC=null;'closed';");
 }
 if(!process.env.AIQ_GLYPH_CASES){
  const expected=JSON.parse(await host(`(function(){G19_DOC=app.documents.add(DocumentColorSpace.CMYK,400,300);var d=G19_DOC,g=d.groupItems.add(),a=d.textFrames.add(),b=d.textFrames.add();a.contents='Clip gy';a.position=[30,180];a.textRange.characterAttributes.size=36;b.contents='Outside AV';b.position=[200,180];b.textRange.characterAttributes.size=20;
  function ref(t){var c=t.duplicate(),o=c.createOutline(),v=o.visibleBounds;o.remove();return [v[0],-v[1],v[2],-v[3]];}
  var ar=ref(a),br=ref(b);a.move(g,ElementPlacement.PLACEATEND);var mask=g.pathItems.rectangle(185,25,60,65);mask.clipping=true;mask.stroked=false;mask.filled=false;g.clipped=true;
  d.selection=null;g.selected=true;b.selected=true;G19_TEXT=b;var opt=new IllustratorSaveOptions();opt.pdfCompatible=false;d.saveAs(new File(${JSON.stringify(folder+'/clipped-batch.ai')}),opt);G19_CALLS=0;
  ar=[Math.max(ar[0],25),Math.max(ar[1],-185),Math.min(ar[2],85),Math.min(ar[3],-120)];return G19.stringify([ar,br]);})();`));
  const result=await measure(),actual=result.measuredObjects.map(o=>o.bounds).sort((a,b)=>a[0]-b[0]);
  check('Clipped group plus independent text exact bounds',actual.length===2&&actual.every((b,i)=>b.every((v,j)=>Math.abs(v-expected[i][j])<0.005)),{actual,expected});
  check('Multiple frames use one native request',await host('String(G19_CALLS);')==='1');
  check('Clipped CMYK fixture remains saved',await host('String(G19_DOC.saved);')==='true');
  await host("G19_DOC.close(SaveOptions.DONOTSAVECHANGES);G19_DOC=null;'closed';");
 }
}catch(e){checks.push({name:'run',passed:false,detail:e.message});process.exitCode=1;}
finally{
 await host("if(G19_DOC)G19_DOC.close(SaveOptions.DONOTSAVECHANGES);if(G19_PREV)G19_PREV.activate();'restored';");close();
 const result={passed:checks.every(x=>x.passed),plugin,hostSha256:hash(original),testSuiteSha256:suiteHash,nativeBinarySha256:nativeBinaryHash,checks};
 await writeFile('docs/review/v0619-glyph-native.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
