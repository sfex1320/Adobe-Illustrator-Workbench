import { Chevron, useAnchoredPopup } from '@aiq/ui';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExportNaming } from '@aiq/contracts';
export const DEFAULT_NAMING: ExportNaming = {
 enabled:false, nameSource:'document-artboard',unit:'mm',decimals:1,
 blocks: ['remark','material','size','name','customer','bleed'].map(kind=>({kind:kind as ExportNaming['blocks'][number]['kind'],enabled:kind==='name',value:''})),
};
const labels={remark:'备注',material:'材质',size:'尺寸',name:'名称',customer:'客户',bleed:'加出血'};
export function ExportNamingFields({value,onChange}:{value:ExportNaming;onChange:(value:ExportNaming)=>void}) {
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState(false);
 const placement=useAnchoredPopup(position,trigger,popup,280,440);
 const close=()=>{setPosition(false);trigger.current?.focus();};
 useEffect(()=>{if(!position)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setPosition(false);trigger.current?.focus();}};const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))setPosition(false);};const resize=()=>setPosition(false);document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);popup.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};},[position]);
 const update=(index:number,patch:Partial<ExportNaming['blocks'][number]>)=>onChange({...value,blocks:value.blocks.map((b,i)=>i===index?{...b,...patch}:b)});
 const move=(index:number,delta:number)=>{const blocks=[...value.blocks];[blocks[index],blocks[index+delta]]=[blocks[index+delta]!,blocks[index]!];onChange({...value,blocks});};
 return <div className="wb-naming"><button ref={trigger} className="wb-naming-trigger" aria-label="命名要求" aria-haspopup="dialog" aria-expanded={!!position} onClick={()=>{if(position){close();return;}setPosition(true);}}><span>命名要求{value.enabled?' · 已启用':''}</span><Chevron/></button>
 {position&&createPortal(<div ref={popup} className="wb-naming-popup" role="dialog" aria-label="命名块设置" style={placement.style} data-placement={placement.side}><div className="wb-naming-heading"><strong>命名要求</strong><button className="aiq-button" onClick={close} aria-label="关闭命名要求">完成</button></div>
 <label className="wb-check" title="空块省略，以“-”连接；同名文件自动编号。尺寸和出血按缩放后的成品值命名。"><input type="checkbox" aria-label="使用命名块" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>组合命名（按下列顺序连接）</label>
 {value.blocks.map((b,i)=><div className="wb-naming-row" key={b.kind}><label className="wb-check" title={b.kind==='size'?'成品宽 × 高（不含出血）。':b.kind==='bleed'?'实际出血：左 / 上 / 右 / 下。':undefined}><input type="checkbox" aria-label={'命名块 '+labels[b.kind]} checked={b.enabled} onChange={e=>update(i,{enabled:e.target.checked})}/>{labels[b.kind]}</label><div className="wb-naming-value">
 {b.kind==='name'?<><select className="aiq-select" aria-label="名称来源" value={value.nameSource} onChange={e=>onChange({...value,nameSource:e.target.value as ExportNaming['nameSource']})}><option value="document-artboard">文件名-画板名</option><option value="artboard">仅画板名</option><option value="custom">直接输入</option></select>{value.nameSource==='custom'&&<input className="aiq-input" aria-label="名称块内容" maxLength={100} value={b.value} onChange={e=>update(i,{value:e.target.value})}/>}</>:(b.kind==='size'||b.kind==='bleed')?null:<input className="aiq-input" aria-label={labels[b.kind]+'内容'} maxLength={100} value={b.value} onChange={e=>update(i,{value:e.target.value})}/>}
 </div><button className="aiq-button" aria-label={'上移'+labels[b.kind]} disabled={!i} onClick={()=>move(i,-1)}>↑</button><button className="aiq-button" aria-label={'下移'+labels[b.kind]} disabled={i===value.blocks.length-1} onClick={()=>move(i,1)}>↓</button></div>)}
 <div className="wb-form-grid"><label className="aiq-field"><span>尺寸单位</span><select className="aiq-select" aria-label="命名尺寸单位" value={value.unit} onChange={e=>onChange({...value,unit:e.target.value as ExportNaming['unit']})}>{['mm','cm','m','pt','px','in'].map(u=><option key={u}>{u}</option>)}</select></label><label className="aiq-field"><span>尺寸小数位</span><select className="aiq-select" aria-label="尺寸小数位" value={value.decimals} onChange={e=>onChange({...value,decimals:Number(e.target.value)})}>{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} 位</option>)}</select></label></div>
 </div>,trigger.current!.closest('.aiq-workbench')??document.body)}</div>;
}
