// Focused browser-only acceptance. Uses real React, CSV worker and pointer/keyboard events.
// The local protocol fixture never connects to Illustrator, executes host scripts or writes design files.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]??path.join(root,'docs/review/ui-features-v0639'));
const widths=(process.env.AIQ_UI_WIDTHS??'260,320,420,640').split(',').map(Number);
const themes=(process.env.AIQ_UI_THEMES??'light,dark').split(',');
const checks=[],errors=[],screenshots=[],externalRequests=[];
const sources=['packages/modules/style-transfer/src/StyleTransferPanel.tsx','apps/panel/src/UpdateSettings.tsx','packages/modules/artboards/src/ArtboardEdges.tsx','scripts/review-features-v0639.mjs','packages/modules/replace/src/EditorReplacePanel.tsx','packages/modules/artboards/src/BleedSettings.tsx','packages/modules/annotation/src/AnnotationPanel.tsx','packages/host-adapter/src/input-keys.ts','scripts/review-editor-v0638.mjs','packages/ui/src/Tooltip.tsx','packages/ui/src/popup.tsx','packages/ui/src/components.tsx','packages/ui/src/theme.css','apps/panel/src/Workbench.tsx','apps/panel/src/workbench.css','packages/ui/src/Arrangement.tsx','packages/ui/src/TextSearch.tsx','packages/modules/size-align/src/EditorSizePanel.tsx','packages/modules/artboards/src/ArtboardPanel.tsx','packages/modules/export/src/EditorExportPanel.tsx','packages/modules/export/src/PackagePanel.tsx','packages/modules/variable-data/src/VariableDataPanel.tsx'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')])));
const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,...(detail?{detail}:{})});if(!passed)throw Error(name);};
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'fixture.csv'),'姓名,图片,链接\n张三,张三.png,https://example.invalid/one\n李四,李四.png,https://example.invalid/two\n','utf8');
const sourceHashes=await hashes();
const server=await createServer({root:path.join(root,'apps/panel'),configFile:path.join(root,'apps/panel/vite.config.ts'),optimizeDeps:{include:['ssf','exceljs','qrcode']},server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'warn'});
await server.listen();
const url=server.resolvedUrls.local[0];
const browser=await puppeteer.launch({executablePath:process.env.AIQ_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
let passed=false;
try{
 for(const width of widths)for(const theme of themes){
  const context=await browser.createBrowserContext(),page=await context.newPage(),prefix=`${width}-${theme}`;
  page.setDefaultTimeout(10000);await page.setViewport({width,height:900});
  page.on('pageerror',error=>errors.push({prefix,message:error.message}));
  await page.setRequestInterception(true);
  page.on('request',r=>{if(r.url().startsWith(url)||/^(data:|blob:)/.test(r.url()))void r.continue();else{externalRequests.push(r.url());void r.abort();}});
  await page.evaluateOnNewDocument(({theme})=>{
   localStorage.setItem('aiq.settings.v1',JSON.stringify({version:1,theme,enabledModules:{},scopePreference:{kind:'document',pierceGroups:true,pierceClipGroups:true,includeMaskPaths:false,includeHidden:false,includeLocked:false},exportFolder:'C:/offline-fixture',liveEditorSync:false,uiSize:'medium',sidebarWidth:62,sidebarAutoHide:false,workbenchView:{group:'home',tool:''}}));
   const objects=Array.from({length:1},(_,i)=>({id:'s'+i,kind:i===0?'text':'path',bounds:[i%3*110,Math.floor(i/3)*90,i%3*110+80+i*4,Math.floor(i/3)*90+60+i*3],fill:'#123456',stroke:null,strokeWidth:0,font:i===0?'ArialMT':null,fontSize:i===0?12:null}));
   const state={token:'offline',docSessionId:'offline',docName:'演示模板.ai',selectionKey:'selected',unsaved:true,hasSaveLocation:true,objects,bounds:[0,0,320,165],artboards:[{index:0,name:'名片模板',bounds:[0,0,200,100]},{index:1,name:'展板',bounds:[250,0,650,300]},{index:2,name:'标签',bounds:[700,0,800,80]}],activeArtboard:0,selectedArtboards:[0,1,2],symmetryPreview:false,capturedTargets:0,capturedSource:true,textSelection:false,rulerUnit:'mm',bleedOffsets:[2,3,7,11],nativeCommands:['group','ungroup','mask-create','mask-release'],nativeSaveAsSupported:false,rasterResolution:300,colorSpace:'rgb',sourceFolder:'C:/offline-fixture'};
   const template={token:'offline-template',docSessionId:'offline',docName:'演示模板.ai',boardName:'名片模板',boardIndex:0,width:200,height:100,objectCount:2,characterStyles:[],graphicStyles:[],targets:[{id:'t0',name:'姓名占位文字',kind:'TextFrame',text:'姓名',width:80,height:20},{id:'t1',name:'照片矩形',kind:'PathItem',rectangle:true,width:60,height:60}]};
   window.offlineCalls=[];window.offlineState=state;window.contextResults=[];document.addEventListener("contextmenu",e=>window.contextResults.push(e.defaultPrevented));
   window.__adobe_cep__={registerKeyEventsInterest:keys=>{window.inputKeys=keys;},getHostEnvironment:()=>JSON.stringify({appSkinInfo:{panelBackgroundColor:{color:{red:35,green:35,blue:35}}}}),evalScript:(script,callback)=>{
    const req=JSON.parse(decodeURIComponent(JSON.parse(script.slice('AIQ.handle('.length,-1))));window.offlineCalls.push(req);let data;
    if(req.command==='PING')data={appName:'Offline UI fixture',appVersion:'30.0.0',documentCount:1};
    else if(req.command==='GET_DOCUMENT_CONTEXT')data={sessionId:'offline',name:'演示模板.ai',unsavedChanges:true,activeArtboardId:'0'};
    else if(req.command==='GET_EDITOR_STATE')data=state;
    else if(req.command==='SELECT_NATIVE_TOOL')data={tool:req.params.tool};
    else if(req.command==='RELEASE_EDITOR_STATE')data=null;
    else if(req.command==='EDIT_DOCUMENT'){
     const a=req.params.action;data={status:'completed',message:'离线模拟响应 · 未执行宿主操作',selectedObjectIds:[],skipped:[],sideEffects:[]};
     if(a.type==='style-transfer'){if(a.operation==='capture')data.styleSample={token:'sample',docSessionId:'offline',rows:[{index:0,name:'来源图形',kind:'PathItem',depth:0,warnings:[],fields:[{key:'fillColor',label:'填充颜色',value:'RGB 10 / 20 / 30'},{key:'size',label:'大小',value:'40 × 20'}]}]};}else if(a.type==='artboards-update'||a.type==='export'){/* Explicit no-write fixture. */}else if(a.type==='set-bleed'){state.bleedOffsets=a.offsets;data.bleedOffsets=a.offsets;}else if(a.type==='read-bleed'){data.bleedOffsets=state.bleedOffsets;}else if(a.type==='annotate'){/* Explicit no-write fixture. */}else if(a.type==='measure-layout')data.measuredObjects=state.objects;else if(['geometry','native'].includes(a.type)){/* Explicit no-write fixture. */}else if(a.type==='fonts')data.fonts=[{name:'ArialMT',family:'Arial',style:'Regular'},{name:'Arial-BoldMT',family:'Arial',style:'Bold'},{name:'SimHei',family:'黑体',style:'Regular'}];
     else if(a.type==='variable-data'&&a.operation==='capture')data.variableTemplate=template;
     else if(a.type==='variable-data'&&a.operation==='bind-selection')data.variableTargetId='t0';
     else throw Error('Fixture rejects unexpected editor action: '+JSON.stringify(a));
    }else throw Error('Fixture rejects unexpected host command: '+req.command);
    callback(JSON.stringify({id:req.id,ok:true,data}));
   }};
   document.addEventListener('DOMContentLoaded',()=>{const banner=document.createElement('div');banner.id='offline-fixture-banner';banner.textContent='演示模式 · 离线模拟 · 未连接 Illustrator';banner.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#ffe4a0;color:#201400;font:10px sans-serif;text-align:center;padding:3px;pointer-events:none';document.body.append(banner);});
  },{theme});

  await page.goto(url,{waitUntil:'networkidle0'});await page.waitForSelector('.aiq-workbench');
  await page.click('[aria-label="刷新文档"]');
  const clickText=async text=>{const h=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t),text);await h.asElement().click();await h.dispose();};
  const shot=async name=>{await page.mouse.move(1,1);const file=prefix+'-'+name+'.png';await page.screenshot({path:path.join(out,file)});screenshots.push(file);};
  await clickText('画板管理');await page.waitForSelector('[aria-label="命名顺序"]');
  const naming=await page.evaluate(()=>{const a=document.querySelector('[aria-label="命名顺序"]').getBoundingClientRect(),b=document.querySelector('[aria-label="命名范围"]').getBoundingClientRect();return {gap:b.top-a.bottom};});
  check(prefix+' naming gap',naming.gap>=10,naming);await shot('artboard-naming');
  await page.click('.wb-artboard-edges>summary');const edge=await page.$('[aria-label="左边调整"]');await edge.click();await page.keyboard.type('2.5');
  check(prefix+' four edges lock',await page.evaluate(()=>['左','上','右','下'].every(side=>document.querySelector('[aria-label="'+side+'边调整"]').value==='2.5')));
  await clickText('应用四边调整');await page.waitForFunction(()=>window.offlineCalls.some(r=>r.params?.action?.type==='artboards-update'));
  const edges=await page.evaluate(()=>window.offlineCalls.find(r=>r.params?.action?.type==='artboards-update').params.action);
  check(prefix+' edges preserve artwork and explicit scope',edges.moveArtwork===false&&edges.boards.length===3,edges);await shot('artboard-edges');
  await clickText('样式吸取');await clickText('吸取所选对象');await page.waitForSelector('.wb-style-row');
  await page.click('.wb-style-row>button');await clickText('赋予所选目标');await page.waitForFunction(()=>window.offlineCalls.some(r=>r.params?.action?.type==='style-transfer'&&r.params.action.operation==='apply'));
  const style=await page.evaluate(()=>window.offlineCalls.find(r=>r.params?.action?.type==='style-transfer'&&r.params.action.operation==='apply').params.action);
  check(prefix+' style includes only chosen fields',style.fields.length===1&&style.fields[0]==='fillColor',style);await shot('style');
  await clickText('文件导出');await clickText('AI');await page.waitForSelector('[aria-label="合集导出"]');await page.click('[aria-label="合集导出"]');await clickText('导出所选');
  await page.waitForFunction(()=>window.offlineCalls.some(r=>r.params?.action?.type==='export'));
  const exp=await page.evaluate(()=>window.offlineCalls.find(r=>r.params?.action?.type==='export').params.action);
  check(prefix+' collection request preserves target',exp.collection===true&&exp.target==='objects'&&exp.format==='ai',exp);await shot('collection');
  if(width===320&&theme==='dark'){
   await page.evaluate(()=>{window.__adobe_cep__.getSystemPath=()=> 'C:/offline-fixture';window.cep={process:{createProcess:()=>{throw Error('Offline fixture must never start a process');}},fs:{stat:()=>({err:0}),readFile:()=>({err:1}),writeFile:()=>({err:0}),makedir:()=>({err:0})}};});
   await clickText('指定画板');await clickText('PNG');await page.select('[aria-label="渲染器"]','independent');
   const setPpi=async value=>{await page.click('[aria-label="导出分辨率"]');await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.type(value);await page.keyboard.press('Tab');};
   const exportRaster=async(name,ppi)=>{await setPpi(String(ppi));await page.evaluate(()=>window.offlineCalls.length=0);await clickText('导出 3 画板');await page.waitForFunction(()=>window.offlineCalls.some(r=>r.params?.action?.type==='export'));const a=await page.evaluate(()=>window.offlineCalls.find(r=>r.params?.action?.type==='export').params.action);check('raster '+name,a.rasterEngine==='independent'&&a.collection===false&&a.resolution===ppi&&a.scale===100&&a.artboardIndexes.length===3,a);};
   await exportRaster('forced-small',72);await exportRaster('forced-high-ppi',300);
   await page.select('[aria-label="渲染器"]','auto');await page.evaluate(()=>window.offlineState.artboards[0].bounds=[0,0,16000,100]);await page.click('[aria-label="刷新文档"]');await exportRaster('auto-large',300);
   await page.evaluate(()=>window.offlineState.artboards[0].bounds=[0,0,200,100]);await page.click('[aria-label="刷新文档"]');await clickText('TIF');await page.select('[aria-label="导出颜色模式"]','cmyk');await exportRaster('RGB-CMYK-TIF isolation',72);
  }
  await page.evaluate(()=>{delete window.cep;delete window.__adobe_cep__.getSystemPath;});await clickText('设置');await page.waitForSelector('.wb-settings-storage-actions');
  const gap=await page.evaluate(()=>document.querySelector('.wb-settings-storage-actions').getBoundingClientRect().top-document.querySelector('[aria-label="设置存储格式"]').getBoundingClientRect().bottom);
  check(prefix+' settings actions spacing',gap>=10,{gap});await shot('settings');
  await clickText('检查更新');await page.waitForFunction(()=>document.body.textContent.includes('自更新需要在 Windows Illustrator'));
  check(prefix+' offline updater never reports success',await page.evaluate(()=>document.body.textContent.includes('自更新需要在 Windows Illustrator')));
  const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  check(prefix+' page fits',geometry.scroll<=width+1,geometry);
  check(prefix+' no errors',errors.length===0,errors);await context.close();console.log('PASS '+prefix);
 }
 check('no external requests',externalRequests.length===0);check('source unchanged',JSON.stringify(sourceHashes)===JSON.stringify(await hashes()));passed=true;
}finally{await browser.close();await server.close();await writeFile(path.join(out,'report.json'),JSON.stringify({passed,mode:'Browser + explicit CEP fixture; no real host writes',sourceHashes,checks,errors,screenshots},null,2));}
console.log(JSON.stringify({passed,checks:checks.length}));

