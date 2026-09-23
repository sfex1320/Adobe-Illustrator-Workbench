import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Chevron, useAnchoredPopup } from './popup.js';

/** CEP-safe editable preset list; opening/changing drafts never calls the host. */
export function PresetInput({label,value,onChange,presets,disabled=false,...inputProps}:{label:string;value:string;onChange:(value:string)=>void;presets:readonly (string|number)[];disabled?:boolean}&Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'list'|'disabled'>) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),popup=useRef<HTMLDivElement>(null),id=useId();
  const {style,side}=useAnchoredPopup(open,root,popup,160,300);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);input.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  const choose=(v:string)=>{onChange(v);setOpen(false);input.current?.focus();};
  return <div className="aiq-preset-input" ref={root}>
    <input {...inputProps} ref={input} className="aiq-input" type="text" aria-label={label} value={value} disabled={disabled} onFocus={e=>{e.currentTarget.select();inputProps.onFocus?.(e);}} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{inputProps.onKeyDown?.(e);if(!e.defaultPrevented&&e.key==='ArrowDown'){e.preventDefault();setOpen(true);}}}/>
    <button type="button" className="aiq-preset-trigger" aria-label={label+'预选'} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>setOpen(!open)}><Chevron/></button>
    {open&&createPortal(<div ref={popup} id={id} className="aiq-preset-popup" role="listbox" aria-label={label+'预选值'} data-placement={side} style={style} onKeyDown={e=>{const items=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role=option]')??[]),i=items.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(i+1)%items.length:(i-1+items.length)%items.length]?.focus();}}}>
      {presets.map(v=><button type="button" key={v} role="option" aria-selected={String(v)===value} onClick={()=>choose(String(v))}>{v}</button>)}
      <button type="button" className="aiq-preset-custom" onClick={()=>{setOpen(false);input.current?.focus();input.current?.select();}}>自定义输入…</button>
    </div>,document.body)}
  </div>;
}
