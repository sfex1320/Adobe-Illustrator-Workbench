import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Viewport coordinates only: no zoom/transform on portal ancestors. */
export function popupPlacement(anchor: {left:number;top:number;bottom:number;width:number}, width:number, height:number, viewport:{width:number;height:number}) {
  const margin=8,gap=4,w=Math.max(0,Math.min(Math.max(anchor.width,width),viewport.width-2*margin));
  const top=Math.max(margin,Math.min(anchor.top,viewport.height-margin)),bottom=Math.max(margin,Math.min(anchor.bottom,viewport.height-margin));
  const below=Math.max(0,viewport.height-margin-bottom-gap),above=Math.max(0,top-gap-margin);
  const side=height>below&&above>below?'up':'down';
  const maxHeight=side==='up'?above:below,h=Math.min(height,maxHeight);
  return {side,style:{position:'fixed' as const,left:Math.max(margin,Math.min(anchor.left,viewport.width-w-margin)),top:Math.max(margin,side==='up'?top-gap-h:bottom+gap),width:w,maxHeight,overflowY:'auto' as const}};
}

export function useAnchoredPopup(open:boolean|string, anchor:RefObject<HTMLElement>, popup:RefObject<HTMLElement>, width=180, height=360) {
  const [placement,setPlacement]=useState<{side:string;style:CSSProperties}>({side:'down',style:{position:'fixed',visibility:'hidden'}});
  useLayoutEffect(()=>{
    if(!open||!anchor.current||!popup.current)return;
    const update=()=>{
      if(!anchor.current||!popup.current)return;
      const next=popupPlacement(anchor.current.getBoundingClientRect(),width,Math.min(height,popup.current.scrollHeight+2),{width:innerWidth,height:innerHeight});
      setPlacement(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    update();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);
    observer?.observe(popup.current);observer?.observe(anchor.current);
    window.addEventListener('resize',update);document.addEventListener('scroll',update,true);
    return()=>{observer?.disconnect();window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true);};
  },[open,anchor,popup,width,height]);
  return placement;
}

export function Chevron(){return <svg className="aiq-chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;}
