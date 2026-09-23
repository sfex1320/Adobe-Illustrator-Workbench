import { describe, expect, it, vi } from 'vitest';
import { Scheduler, Workspace } from '@aiq/core';
import { CepBridge, CepHostAdapter, DemoHostAdapter } from '@aiq/host-adapter';
import { DEFAULT_APP_SETTINGS } from '@aiq/contracts';

describe('performance: physical completion and discarded work', () => {
  it('bridge timeout keeps the physical lane until callback; late result is discarded without replay', async () => {
    const calls: Array<{script:string; cb:(s:string)=>void}> = [];
    const bridge = new CepBridge((script,cb)=>{calls.push({script,cb});}, 10);
    const scheduler = new Scheduler(()=>bridge.idle());
    const first = scheduler.run('write',()=>bridge.send('EDIT_DOCUMENT'));
    const second = scheduler.run('read',()=>bridge.send('GET_EDITOR_STATE'));
    const rejected = expect(second).rejects.toMatchObject({code:'OPERATION_CANCELLED'});
    await expect(first).rejects.toMatchObject({code:'HOST_TIMEOUT'});await rejected;
    // 超时不能向仍忙的 Illustrator 叠加命令。
    for(let i=0;i<3;i++) await expect(scheduler.run('read',()=>bridge.send('GET_EDITOR_STATE'))).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    expect(calls).toHaveLength(1);
    // 原始超时请求的迟到回调按 ID 丢弃，不被当作任何新请求的结果。
    calls[0]!.cb('EvalScript error.');
    await scheduler.idle();
    const manual=scheduler.run('manual',()=>bridge.send('PING'));
    const last=calls[calls.length-1]!;const id=JSON.parse(decodeURIComponent(last.script.slice(12,-2))).id;
    last.cb(JSON.stringify({id,ok:true,data:'ok'}));
    await expect(manual).resolves.toBe('ok');
  });
  it('bounds queue length and abort removes a queued write before dispatch', async () => {
    const scheduler=new Scheduler(undefined,2);let finish!:()=>void;
    const active=scheduler.run('active',()=>new Promise<void>(r=>{finish=r;}));
    const spy=vi.fn(async()=>undefined),controller=new AbortController();
    const abandoned=scheduler.run('abandoned',spy,{signal:controller.signal});
    const other=scheduler.run('other',async()=>42);
    await expect(scheduler.run('overflow',spy)).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    controller.abort();await expect(abandoned).rejects.toMatchObject({code:'OPERATION_CANCELLED'});
    expect(scheduler.getDiagnostics().queued).toBe(1);
    finish();await active;expect(await other).toBe(42);expect(spy).not.toHaveBeenCalled();
  });
  it('coalesces simultaneous editor reads and discards an obsolete in-flight result', async()=>{
    let done!:(s:null)=>void;const adapter=new CepHostAdapter(new CepBridge(()=>{}));
    adapter.readEditorState=vi.fn(()=>new Promise<null>(r=>{done=r;}));
    adapter.releaseEditorState=async()=>{};
    const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
    const one=ws.readEditorState(),two=ws.readEditorState();expect(one).toBe(two);
    ws.cancelEditorRequests(false);done(null);
    await expect(one).rejects.toMatchObject({code:'OPERATION_CANCELLED'});
    expect(adapter.readEditorState).toHaveBeenCalledTimes(1);expect(ws.getEditorState()).toBe(null);
  });
  it('leaving during document context lookup never sends the subsequent document scan',async()=>{
    const adapter=new DemoHostAdapter();const original=adapter.getDocumentContext.bind(adapter);
    let finish!:()=>void;adapter.getDocumentContext=()=>new Promise(r=>{finish=()=>void original().then(r);});
    const scan=vi.spyOn(adapter,'collectSnapshot');
    const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
    const pending=ws.ensureSnapshot(ws.currentScope());ws.cancelEditorRequests(false);finish();
    await expect(pending).rejects.toMatchObject({code:'OPERATION_CANCELLED'});expect(scan).not.toHaveBeenCalled();
  });
});
import type {EditorState} from '@aiq/contracts';
it('lightweight pulse updates header without rescanning objects or creating a token',async()=>{
 const adapter=new CepHostAdapter(new CepBridge(()=>{}));
 const state={token:'stable',docSessionId:'d',docName:'Test',objects:[],artboards:[{index:0,name:'A',bounds:[0,0,100,80]},{index:1,name:'B',bounds:[150,0,300,80]}],activeArtboard:0,rulerUnit:'pt',layers:[]} as unknown as EditorState;
 adapter.readEditorState=vi.fn(async()=>state);adapter.getEditorRevision=vi.fn(async()=>JSON.stringify({revision:'same-selection',docSessionId:'d',activeArtboard:1,artboard:{index:1,name:'B',bounds:[150,0,320,80]},rulerUnit:'pt',layers:[]}));
 const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
 await ws.readEditorState();const notify=vi.fn();ws.onEditorState(notify);
 expect(await ws.getEditorRevision()).toBe('same-selection');expect(ws.getEditorState()?.activeArtboard).toBe(1);expect(ws.getEditorState()?.artboards[1]?.bounds[2]).toBe(320);expect(ws.getEditorState()?.token).toBe('stable');expect(adapter.readEditorState).toHaveBeenCalledOnce();expect(notify).toHaveBeenCalledOnce();
 await ws.getEditorRevision();expect(notify).toHaveBeenCalledOnce();
});
it('a late pulse after navigation cannot restore an obsolete document or schedule a scan',async()=>{
 const adapter=new CepHostAdapter(new CepBridge(()=>{}));let finish!:(v:string)=>void;
 adapter.getEditorRevision=()=>new Promise(resolve=>{finish=resolve;});
 const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});const read=vi.spyOn(ws,'readEditorState');
 const pending=ws.getEditorRevision();ws.cancelEditorRequests(false);finish(JSON.stringify({revision:'old',docSessionId:'old'}));expect(await pending).toBeNull();expect(ws.getEditorState()).toBeNull();expect(read).not.toHaveBeenCalled();
});

it('cancelled automatic reads never dispatch from the queue and never cancel explicit reads',async()=>{
 const adapter=new CepHostAdapter(new CepBridge(()=>{}));let finish!:(s:null)=>void;
 const read=vi.fn(()=>new Promise<null>(r=>{finish=r;}));adapter.readEditorState=read;
 const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
 const active=ws.readEditorState('document'),controller=new AbortController();
 const automatic=ws.readEditorState('selection',controller.signal);const rejected=expect(automatic).rejects.toMatchObject({code:'OPERATION_CANCELLED'});
 const manual=ws.readEditorState('selection');controller.abort();await rejected;finish(null);await active;
 await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(2));finish(null);await expect(manual).resolves.toBeNull();
});
it('a returned automatic result after pointer leave is discarded without publishing',async()=>{
 const adapter=new CepHostAdapter(new CepBridge(()=>{}));let finish!:(s:EditorState)=>void;
 adapter.readEditorState=()=>new Promise(r=>{finish=r;});
 const ws=new Workspace({adapter,settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});const notify=vi.fn();ws.onEditorState(notify);
 const controller=new AbortController(),pending=ws.readEditorState('selection',controller.signal);controller.abort();finish({token:'late',docSessionId:'d'} as EditorState);
 await expect(pending).rejects.toMatchObject({code:'OPERATION_CANCELLED'});expect(notify).not.toHaveBeenCalled();expect(ws.getEditorState()).toBeNull();
});
