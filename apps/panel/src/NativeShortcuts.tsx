import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import type {Workspace} from '@aiq/core';
import {NATIVE_SHORTCUTS} from '@aiq/core';
import {Chevron,useAnchoredPopup,Icon,useEditor,EditorFeedback} from '@aiq/ui';
export function NativeShortcuts({workspace}:{workspace:Workspace}) {
 const e=useEditor(workspace),[active,setActive]=useState(''),root=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement|null>(null),popup=useRef<HTMLDivElement>(null);
 const placement=useAnchoredPopup(active,trigger,popup,190,360);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setActive('');};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 return <section ref={root} className="wb-native-shortcuts" aria-label="原生对象快捷工具"><EditorFeedback message={e.message} error={e.error}/><div className="wb-shortcut-grid">{NATIVE_SHORTCUTS.map(g=><div className="wb-native-menu" key={g.title}>
 <button className="wb-native-trigger" aria-haspopup="menu" aria-expanded={active===g.title} onClick={event=>{trigger.current=event.currentTarget;setActive(active===g.title?'':g.title);if(!e.state)void e.read();}}><Icon name="modules" size={12}/><span>{g.title}</span><Chevron/></button>
 {active===g.title&&createPortal(<div ref={popup} style={placement.style} data-placement={placement.side} onKeyDown={event=>{if(event.key==='Escape'){setActive('');trigger.current?.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='ArrowDown'?(index+1)%buttons.length:(index-1+buttons.length)%buttons.length]?.focus();}}} role="menu" aria-label={`${g.title}菜单`} className="wb-native-dropdown">{g.commands.map(([id,label])=><button role="menuitem" key={id} title={e.state?.nativeCommands?.includes(id)?`Illustrator：对象 > ${g.title} > ${label}`:'此命令尚未通过当前宿主验证'} disabled={e.busy||!e.state?.nativeCommands?.includes(id)} onClick={()=>{void e.act(id==='smart-group'||id==='ungroup-all'?{type:id}:{type:'native',command:id});setActive('');}}>{label}</button>)}</div>,document.body)}
 </div>)}</div></section>;
}
