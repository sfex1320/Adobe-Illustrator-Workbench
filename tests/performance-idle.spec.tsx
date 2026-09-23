// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useEditor } from '@aiq/ui';
import type { EditorResult, EditorState } from '@aiq/contracts';
import { watchEditorSync } from '../packages/ui/src/editor-sync';

afterEach(()=>{cleanup();vi.useRealTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
it('persistent property bar does not refresh after navigating away during a sent write',async()=>{
  let listener!:(state:EditorState|null)=>void,finish!:()=>void;
  const state={token:'1',docSessionId:'d'} as EditorState;
  const read=vi.fn(async()=>state);
  const port={getEditorState:()=>state,readEditorState:read,onEditorState:(fn:typeof listener)=>{listener=fn;return()=>{};},editDocument:()=>new Promise<EditorResult>(resolve=>{finish=()=>resolve({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:['properties']});})};
  const hook=renderHook(()=>useEditor(port));
  let action:ReturnType<typeof hook.result.current.act>;
  act(()=>{action=hook.result.current.act({type:'properties',fill:'#000000'});});
  await act(async()=>{await Promise.resolve();});
  act(()=>listener(null));
  await act(async()=>{finish();await action;});
  expect(read).toHaveBeenCalledTimes(1); // 仅操作前读取；退出后不再补读。
});

function enter(buttons=0){const event=new Event('pointerenter');Object.defineProperty(event,'buttons',{value:buttons});document.documentElement.dispatchEvent(event);}
function leave(){document.documentElement.dispatchEvent(new Event('pointerleave'));}
it('visible auto-sync makes zero canvas/idle calls for 60s, shares one richest read on return',async()=>{
 vi.useFakeTimers();const read=vi.fn(async(_profile?:string,_signal?:AbortSignal)=>null),probe=vi.fn(async()=>'one');
 const port={readEditorState:read,getEditorRevision:probe,getSettings:()=>({liveEditorSync:true}),editDocument:vi.fn()};
 const off1=watchEditorSync(port,'document'),off2=watchEditorSync(port,'properties');
 await vi.advanceTimersByTimeAsync(60000);expect(read).not.toHaveBeenCalled();expect(probe).not.toHaveBeenCalled();
 enter();enter();await vi.advanceTimersByTimeAsync(201);expect(read).toHaveBeenCalledOnce();expect(read.mock.calls[0]?.[0]).toBe('properties');
 await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledOnce();
 leave();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledOnce();expect(probe).not.toHaveBeenCalled();
 off2();off1();
});
it('leaving, dragging through the panel, blur and hiding cancel pending entry reads',async()=>{
 vi.useFakeTimers();const read=vi.fn(async()=>null);const off=watchEditorSync({readEditorState:read,editDocument:vi.fn()},'selection');
 enter();leave();await vi.advanceTimersByTimeAsync(1000);
 enter(1);await vi.advanceTimersByTimeAsync(1000);
 enter();window.dispatchEvent(new Event('blur'));await vi.advanceTimersByTimeAsync(1000);
 enter();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(1000);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(1000);
 expect(read).not.toHaveBeenCalled();off();
});
it('disabled sync blocks return reads and does not block explicit reads/actions',async()=>{
 vi.useFakeTimers();const state={token:'1',docSessionId:'d'} as EditorState;
 const read=vi.fn(async()=>state),edit=vi.fn(async()=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[]} as EditorResult));
 const port={getSettings:()=>({liveEditorSync:false}),readEditorState:read,editDocument:edit};
 const hook=renderHook(()=>useEditor(port,'selection',{autoRefresh:true}));
 enter();await vi.advanceTimersByTimeAsync(60000);expect(read).not.toHaveBeenCalled();
 await act(async()=>{await hook.result.current.act({type:'native',command:'group'});});expect(edit).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledOnce();
});
it('a late read is aborted on leave and never starts followup work',async()=>{
 vi.useFakeTimers();let finish!:()=>void;let signal:AbortSignal|undefined;
 const read=vi.fn((_profile?:string,s?:AbortSignal)=>{signal=s;return new Promise<null>(r=>{finish=()=>r(null);});});
 const off=watchEditorSync({readEditorState:read,editDocument:vi.fn()},'properties');
 enter();await vi.advanceTimersByTimeAsync(201);leave();expect(signal?.aborted).toBe(true);
 enter();await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledOnce();
 off();finish();await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledOnce();
});
