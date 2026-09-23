import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {popupPlacement} from './popup.js';
import type {CSSProperties} from 'react';

/** One DOM-only tooltip layer; never reads or writes the Illustrator document. */
export function TooltipLayer() {
 const id=useId(),box=useRef<HTMLDivElement>(null);
 const [tip,setTip]=useState<{element:HTMLElement;text:string}|null>(null);
 const [style,setStyle]=useState<CSSProperties>({visibility:'hidden'});
 useEffect(()=>{
  let owner:HTMLElement|null=null,savedTitle:string|null=null,described:string|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const hide=()=>{clearTimeout(timer);if(owner){if(savedTitle!==null&&!owner.hasAttribute('title'))owner.setAttribute('title',savedTitle);if(described===null)owner.removeAttribute('aria-describedby');else owner.setAttribute('aria-describedby',described);}owner=null;savedTitle=null;setTip(null);};
  const show=(event:Event)=>{
   const target=event.target instanceof Element?event.target:null;
   const next=target?.closest<HTMLElement>('[data-help],[title]');
   if(owner&&target&&owner.contains(target)&&(!next||next===owner||!owner.contains(next)))return;
   if(next===owner)return;
   hide();if(!next)return;
   const text=next.getAttribute('data-help')||next.getAttribute('title');if(!text?.trim())return;
   owner=next;savedTitle=next.getAttribute('title');described=next.getAttribute('aria-describedby');
   next.removeAttribute('title');
   timer=setTimeout(()=>{if(owner!==next||!next.isConnected)return;next.setAttribute('aria-describedby',[described,id].filter(Boolean).join(' '));setStyle({visibility:'hidden'});setTip({element:next,text});},event.type==='focusin'?0:350);
  };
  const leave=(event:Event)=>{const related=(event as MouseEvent).relatedTarget;if(owner&&related instanceof Node&&owner.contains(related))return;hide();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
  document.addEventListener('mouseover',show);document.addEventListener('focusin',show);
  document.addEventListener('mouseout',leave);document.addEventListener('focusout',leave);
  document.addEventListener('scroll',hide,true);document.addEventListener('keydown',key);document.addEventListener('pointerdown',hide,true);
  window.addEventListener('blur',hide);window.addEventListener('resize',hide);
  return()=>{hide();document.removeEventListener('mouseover',show);document.removeEventListener('focusin',show);document.removeEventListener('mouseout',leave);document.removeEventListener('focusout',leave);document.removeEventListener('scroll',hide,true);document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',hide,true);window.removeEventListener('blur',hide);window.removeEventListener('resize',hide);};
 },[id]);
 useLayoutEffect(()=>{if(!tip||!box.current)return;const anchor=tip.element.getBoundingClientRect();const p=popupPlacement({left:anchor.left,top:anchor.top,bottom:anchor.bottom,width:0},Math.min(340,innerWidth-16),box.current.scrollHeight+2,{width:innerWidth,height:innerHeight});setStyle(p.style);},[tip]);
 return tip?createPortal(<div ref={box} id={id} role="tooltip" className="aiq-tooltip" style={style}>{tip.text}</div>,document.body):null;
}
