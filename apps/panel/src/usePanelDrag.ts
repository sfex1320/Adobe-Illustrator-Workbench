import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,RefObject} from 'react';

/** Panel-only gesture. Never calls the host or intercepts form controls. */
export function usePanelDrag(main:RefObject<HTMLElement>) {
  const cleanup=useRef<()=>void>(()=>{});
  const [dragging,setDragging]=useState(false);
  useEffect(()=>{
    const stop=()=>cleanup.current();
    window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);
    return()=>{stop();window.removeEventListener('blur',stop);window.removeEventListener('pagehide',stop);};
  },[]);
  const onPointerDownCapture=(event:ReactPointerEvent<HTMLElement>)=>{
    if(event.button!==0||event.pointerType==='touch'||!(event.target instanceof Element))return;
    const target=event.target,grip=target.closest('[data-panel-grip]');
    if(!grip&&target.closest('button,input,select,textarea,a,summary,[role=separator],[role=slider],[contenteditable=true]'))return;
    const label=target.closest('label');
    const interactiveLabel=label?.querySelector('input,select,textarea');
    let moved=false;
    let scroller:HTMLElement|null=grip?(main.current?.querySelector<HTMLElement>('.wb-export-scroll')??main.current):target.closest<HTMLElement>('.wb-export-scroll,.wb-sidebar,.wb-main');
    while(scroller&&scroller.scrollHeight<=scroller.clientHeight+1)scroller=scroller.parentElement?.closest<HTMLElement>('.wb-export-scroll,.wb-sidebar,.wb-main')??null;
    if(!scroller)return;
    const bounds=scroller.getBoundingClientRect();
    if(!grip&&event.clientX>=bounds.left+scroller.clientWidth)return;
    cleanup.current();
    const element=scroller,startY=event.clientY,scrollTop=element.scrollTop,id=event.pointerId;
    const owner=event.currentTarget;
    const stop=()=>{if(moved){const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};window.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>window.removeEventListener('click',suppress,true),0);}window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);owner.removeEventListener('lostpointercapture',stop);if(owner.hasPointerCapture?.(id))owner.releasePointerCapture(id);setDragging(false);cleanup.current=()=>{};};
    const move=(e:PointerEvent)=>{if(e.pointerId!==id)return;if(!(e.buttons&1)){stop();return;}if(Math.abs(e.clientY-startY)<4)return;e.preventDefault();if(!moved)owner.setPointerCapture?.(id);moved=true;setDragging(true);element.scrollTop=scrollTop+startY-e.clientY;};
    owner.addEventListener('lostpointercapture',stop);
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
    cleanup.current=stop;
    if(!interactiveLabel)event.preventDefault();
  };
  return {dragging,onPointerDownCapture};
}
