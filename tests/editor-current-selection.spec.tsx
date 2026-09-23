// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook} from '@testing-library/react';
import {useEditor} from '@aiq/ui';
import type {EditorState,EditorResult} from '@aiq/contracts';
afterEach(cleanup);
it('computes an explicit action from current selection instead of cached geometry',async()=>{
 const old={token:'old',objects:[{id:'s0',bounds:[0,0,50,50]}]} as EditorState;
 const fresh={token:'fresh',objects:[{id:'s0',bounds:[10,20,110,70]}]} as EditorState;
 const edit=vi.fn(async():Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],sideEffects:[],skipped:[]}));
 const port={getEditorState:()=>old,readEditorState:vi.fn(async()=>fresh),editDocument:edit};
 const hook=renderHook(()=>useEditor(port));
 await act(()=>hook.result.current.act(s=>({type:'geometry',transforms:s.objects.map(o=>({id:o.id,bounds:o.bounds}))})));
 expect(edit).toHaveBeenCalledWith(fresh,{type:'geometry',transforms:[{id:'s0',bounds:[10,20,110,70]}]},expect.any(AbortSignal));
 expect(port.readEditorState).toHaveBeenCalledTimes(1);
});
it('shows plan errors before dispatch and never falls back to previous objects',async()=>{
 const edit=vi.fn();const port={readEditorState:vi.fn(async()=>({token:'fresh',objects:[]} as unknown as EditorState)),editDocument:edit};
 const hook=renderHook(()=>useEditor(port));
 await act(()=>hook.result.current.act(s=>{if(!s.objects.length)throw Error('没有选择对象');return {type:'outlines'};}));
 expect(edit).not.toHaveBeenCalled();expect(hook.result.current.error).toBe('没有选择对象');
});
