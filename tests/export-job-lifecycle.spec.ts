import {afterEach, describe, expect, it, vi} from 'vitest';
import {CepBridge, DemoHostAdapter} from '@aiq/host-adapter';
import {Workspace} from '@aiq/core';
import {DEFAULT_APP_SETTINGS} from '@aiq/contracts';
import {ExportPreparationController} from '../packages/host-adapter/src/export-job-controller.js';
import {parsePreparedReceipt} from '../packages/host-adapter/src/export-job-store.js';
import type {EditorRequest, EditorState, RasterJob} from '@aiq/contracts';

const request:EditorRequest={docSessionId:'doc-one',token:'token-one',action:{type:'export',rasterEngine:'independent',jobId:'job-fixture-01',target:'artboards',artboardIndexes:[0],allArtboards:false,format:'jpeg',colorMode:'cmyk',scale:1000,resolution:72,folder:'G:/output'}};
const job:RasterJob={protocol:1,jobId:'job-fixture-01',pages:[{index:0,pdf:'page-0.pdf',output:'G:/output/one.jpg',sizePt:[100,200]}],folder:'G:/output',format:'jpeg',color:'cmyk',ppi:72,scale:10,quality:100,transparent:true,profile:'source',iccPath:'',optimize:true};
afterEach(()=>vi.useRealTimers());

describe('independent preparation continuation, without replaying Illustrator',()=>{
  function fixture(){
    let reply:((raw:string)=>void)|undefined, id='';
    const data=new Map<string,string>();
    const bridge=new CepBridge((script,cb)=>{reply=cb;id=JSON.parse(decodeURIComponent(script.slice(12,-2))).id;});
    const c=new ExportPreparationController(bridge,{read:name=>data.get(name)??null,remove:name=>{data.delete(name);}},()=> 'a'.repeat(32));
    const complete=()=>reply?.(JSON.stringify({id,ok:true,data:{status:'completed',rasterJob:job,skipped:[],selectedObjectIds:[],sideEffects:[]}}));
    const receipt=()=>data.set('prepared-job-fixture-01.json',JSON.stringify({schema:1,jobId:job.jobId,requestKey:'a'.repeat(32),workingDocumentClosed:true,job}));
    return {bridge,c,complete,receipt,data};
  }
  it('a 27 minute preparation survives the 10 minute wait, without opening the lane early',async()=>{
    vi.useFakeTimers();const {bridge,c,receipt,complete}=fixture();
    const pending=c.start(request);const failure=expect(pending).rejects.toMatchObject({code:'HOST_TIMEOUT'});
    await vi.advanceTimersByTimeAsync(600000);await failure;
    let finished=false;const recovery=c.recover(request).then(r=>{finished=true;return r;});
    const recovered=expect(recovery).resolves.toHaveProperty('rasterJob',job);
    receipt();await vi.advanceTimersByTimeAsync(1028390);
    expect(finished).toBe(false);
    await expect(bridge.send('PING')).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    complete();await recovered;
    expect(bridge.diagnostics.sent).toBe(1);
    expect(bridge.diagnostics.discardedLate).toBe(1);
  });
  it('an unrelated/new controller cannot consume a previous preparation receipt',async()=>{
    const {c,receipt}=fixture();receipt();
    await expect(c.recover(request)).rejects.toThrow(/本次/);
  });
  it('changed parameters cannot recover a timed-out job',async()=>{
    vi.useFakeTimers();const {c}=fixture();const result=c.start(request);const rejected=expect(result).rejects.toMatchObject({code:'HOST_TIMEOUT'});
    await vi.advanceTimersByTimeAsync(600000);await rejected;
    await expect(c.recover({...request,token:'another'})).rejects.toThrow(/改变/);
  });
  it('a failed native close with no sealed receipt cannot be reported as prepared',async()=>{
    vi.useFakeTimers();const {c,complete}=fixture();const result=c.start(request);const rejected=expect(result).rejects.toMatchObject({code:'HOST_TIMEOUT'});
    await vi.advanceTimersByTimeAsync(600000);await rejected;const recovery=c.recover(request);const failed=expect(recovery).rejects.toThrow(/凭据/);
    complete();await failed;
  });
  it('blocks a duplicate dispatch while a preparation is outstanding',async()=>{
    const {c,complete}=fixture();const first=c.start(request);
    await expect(c.start(request)).rejects.toThrow(/任务/);
    complete();await first;
  });
  it('the real workspace keeps its task alive and launches the worker once after late preparation',async()=>{
    const {bridge,c,receipt,complete}=fixture();
    let workers=0;
    const adapter=Object.assign(new DemoHostAdapter(),{
      readEditorState:async()=>({docSessionId:'doc-one',token:'token-one',selectionKey:'one',unsaved:false,objects:[],bounds:null,artboards:[{index:0,name:'A',bounds:[0,200,100,0]}],activeArtboard:0,symmetryPreview:false,capturedTargets:0,textSelection:false} satisfies EditorState),
      editDocument:(r:EditorRequest)=>c.start(r),
      recoverRasterPreparation:(r:EditorRequest)=>c.recover(r),
      waitForHostIdle:()=>bridge.idle(),
      finishRasterExport:async()=>{workers++;return {status:'completed' as const,files:['one.jpg'],skipped:[],sideEffects:[],selectedObjectIds:[]};},
    });
    const connect=adapter.connect.bind(adapter);adapter.connect=async()=>{const info=await connect();info.capabilities.editorTools={supported:true,verifiedOnHost:false};return info;};
    const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
    await ws.initialize();const state=await ws.readEditorState();expect(state).not.toBeNull();
    vi.useFakeTimers();const page=new AbortController();const pending=ws.editDocument(state!,request.action,page.signal);
    await vi.advanceTimersByTimeAsync(1);page.abort(); // Changing module must not orphan an explicitly started export.
    await vi.advanceTimersByTimeAsync(1628390);
    expect(ws.isExportRunning(job.jobId)).toBe(true);expect(workers).toBe(0);
    await expect(ws.editDocument(state!,{...request.action})).rejects.toThrow(/仍在运行/);
    receipt();complete();expect((await pending).files).toEqual(['one.jpg']);
    expect(workers).toBe(1);expect(ws.isExportRunning(job.jobId)).toBe(false);
  });
});

describe('sealed preparation record validation',()=>{
  const sealed=()=>({schema:1,jobId:job.jobId,requestKey:'a'.repeat(32),workingDocumentClosed:true,job});
  it('rejects mismatched ownership, unfinished cleanup and invalid dimensions',()=>{
    for(const change of [{requestKey:'b'.repeat(32)},{workingDocumentClosed:false},{schema:2},{job:{...job,pages:[{...job.pages[0],sizePt:[0,200]}]}}]){
      expect(()=>parsePreparedReceipt(JSON.stringify({...sealed(),...change}),job.jobId,'a'.repeat(32))).toThrow();
    }
  });
  it('rejects input traversal, duplicate pages and output escape',()=>{
    for(const pages of [[{...job.pages[0],pdf:'../page-0.pdf'}],[job.pages[0],job.pages[0]],[{...job.pages[0],output:'G:/elsewhere/a.jpg'}]]){
      expect(()=>parsePreparedReceipt(JSON.stringify({...sealed(),job:{...job,pages}}),job.jobId,'a'.repeat(32))).toThrow();
    }
  });
  it('accepts a correctly owned complete job, preserving requested quality and scale',()=>{
    expect(parsePreparedReceipt(JSON.stringify(sealed()),job.jobId,'a'.repeat(32)).job).toEqual(job);
  });
});
