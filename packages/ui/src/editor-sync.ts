import type { EditorPort } from './editor.js';
type Profile = 'document'|'selection'|'properties';
const ranks:Record<Profile,number>={document:0,selection:1,properties:2};
const sessions=new WeakMap<EditorPort,{watch:(profile:Profile)=>()=>void}>();
/** Return-to-panel refresh only. Visibility/focus never proves Illustrator is idle.
 * No periodic probes, mount reads, or completion-triggered retries are permitted. */
export function watchEditorSync(port:EditorPort,profile:Profile):()=>void {
  let session=sessions.get(port);
  if(!session){
    const watchers=new Map<symbol,Profile>();
    let timer:ReturnType<typeof setTimeout>|undefined,inside=false,closed=false;
    let flight:AbortController|undefined;
    const cancel=()=>{clearTimeout(timer);flight?.abort();};
    const leave=()=>{inside=false;cancel();};
    const schedule=()=>{
      clearTimeout(timer);
      if(closed||!inside||document.hidden||port.getSettings?.().liveEditorSync===false)return;
      timer=setTimeout(()=>{
        if(closed||!inside||document.hidden||flight||port.getSettings?.().liveEditorSync===false)return;
        const controller=new AbortController();flight=controller;
        const best=[...watchers.values()].sort((a,b)=>ranks[b]-ranks[a])[0]??'document';
        void port.readEditorState(best,controller.signal).catch(()=>{/* Explicit reads show errors. */}).finally(()=>{
          if(flight===controller)flight=undefined;
        });
      },200);
    };
    const enter=(event:PointerEvent)=>{inside=event.buttons===0;if(inside)schedule();else cancel();};
    const hide=()=>{if(document.hidden)leave();};
    const root=document.documentElement;
    root.addEventListener('pointerenter',enter);root.addEventListener('pointerleave',leave);
    window.addEventListener('blur',leave);window.addEventListener('pagehide',leave);
    document.addEventListener('visibilitychange',hide);
    session={watch(p){const id=Symbol();watchers.set(id,p);if(inside)schedule();return()=>{
      watchers.delete(id);
      if(!watchers.size){closed=true;leave();root.removeEventListener('pointerenter',enter);root.removeEventListener('pointerleave',leave);window.removeEventListener('blur',leave);window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',hide);sessions.delete(port);}
    };}};
    sessions.set(port,session);
  }
  return session.watch(profile);
}
