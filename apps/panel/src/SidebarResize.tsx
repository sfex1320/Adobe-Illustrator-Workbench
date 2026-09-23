import {useEffect,useRef} from 'react';
export function SidebarResize({width,onChange,side='left',locked=false}:{width:number;onChange:(width:number)=>void;side?:'left'|'right';locked?:boolean}) {
  const cleanup=useRef<()=>void>(()=>{});
  useEffect(()=>{const stop=()=>cleanup.current();window.addEventListener('blur',stop);return()=>{stop();window.removeEventListener('blur',stop);};},[]);
  return <div className="wb-sidebar-resize" role="separator" aria-disabled={locked} aria-label="调整工具栏宽度" aria-orientation="vertical" aria-valuemin={62} aria-valuemax={190} aria-valuenow={Math.round(width)} tabIndex={locked?-1:0}
    onKeyDown={e=>{if(!locked&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();onChange(e.key==='Home'?62:e.key==='End'?190:Math.max(62,Math.min(190,width+(e.key==='ArrowLeft'?-8:8)*(side==='right'?-1:1))));}}}
    onPointerDown={e=>{if(locked||e.button!==0)return;e.preventDefault();cleanup.current();const owner=e.currentTarget,id=e.pointerId,startX=e.clientX,startWidth=width,scale=Number(getComputedStyle(document.documentElement).getPropertyValue('--aiq-ui-scale'))||1;
      const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);owner.removeEventListener('lostpointercapture',stop);if(owner.hasPointerCapture?.(id))owner.releasePointerCapture(id);cleanup.current=()=>{};};
      const move=(event:PointerEvent)=>{if(event.pointerId!==id)return;if(!(event.buttons&1)){stop();return;}onChange(Math.max(62,Math.min(190,startWidth+(event.clientX-startX)/scale*(side==='right'?-1:1))));};
      owner.setPointerCapture?.(id);owner.addEventListener('lostpointercapture',stop);window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);cleanup.current=stop;
    }}><span/></div>;
}
