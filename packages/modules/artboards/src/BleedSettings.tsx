import {useEffect,useRef,useState} from 'react';
import type {Workspace} from '@aiq/core';
import {parseNumberExpression,unitFactor} from '@aiq/core';
import {Button,Card,Field,useEditor,usePreference,EditorFeedback} from '@aiq/ui';
const sides=[['上',1],['下',3],['左',0],['右',2]] as const;
const format=(n:number)=>String(Number(n.toFixed(2)));
export function BleedSettings({workspace}:{workspace:Workspace}){
 const e=useEditor(workspace,'document'),[draft,setDraft]=useState(['','','','']),[locked,setLocked]=usePreference(workspace,'artboards.bleedLocked',true);
 const dirty=useRef(false),previous=useRef({doc:'',factor:1});
 const doc=e.state?.docSessionId??'',unit=e.state?.rulerUnit,factor=unit?unitFactor(unit):1,values=e.state?.bleedOffsets;
 const current=values?.length===4&&values.every(n=>Number.isFinite(n)&&n>=0)?values:null;
 const key=current?.join(',')??'';
 useEffect(()=>{
  const old=previous.current;
  if(old.doc!==doc){dirty.current=false;setDraft(current?current.map(n=>format(n/factor)):['','','','']);}
  else if(old.factor!==factor)setDraft(items=>items.map(v=>{try{return format(parseNumberExpression(v)*old.factor/factor);}catch{return v;}}));
  else if(!dirty.current)setDraft(current?current.map(n=>format(n/factor)):['','','','']);
  previous.current={doc,factor};
 },[doc,factor,key]); // eslint-disable-line react-hooks/exhaustive-deps
 const change=(index:number,value:string)=>{dirty.current=true;setDraft(items=>items.map((v,i)=>locked||i===index?value:v));};
 return <Card title="文档出血" icon="doc" help="四边出血作用于文档中的所有画板。应用时写入文档设置，不缩放设计稿。">
  <EditorFeedback message={e.message} error={e.error}/>
  <label className="wb-check"><input type="checkbox" checked={locked} onChange={event=>setLocked(event.target.checked)}/>锁定四边（输入时同步）</label>
  <div className="wb-form-grid">{sides.map(([name,index])=><Field key={name} label={`${name} ${unit??''}`}><input className="aiq-input" aria-label={`${name}出血`} inputMode="decimal" value={draft[index]} onChange={event=>change(index,event.target.value)} onBlur={()=>{try{const value=format(parseNumberExpression(draft[index]!));setDraft(items=>items.map((v,i)=>i===index?value:v));}catch{/* Keep incomplete drafts for correction. */}}}/></Field>)}</div>
  <div className="aiq-row wb-space"><Button disabled={e.busy||!doc} onClick={()=>void e.act({type:'read-bleed'}).then(result=>{if(result?.bleedOffsets){dirty.current=false;setDraft(result.bleedOffsets.map(n=>format(n/factor)));}})}>读取当前出血</Button>
  <Button variant="primary" disabled={e.busy||!doc||!unit} onClick={()=>void e.act(state=>{if(state.rulerUnit!==unit)throw Error('文档单位已变化，请核对出血数值');const offsets=draft.map(v=>parseNumberExpression(v)*factor);if(offsets.some(n=>n<0||n>72))throw Error(`每边出血须为 0–${format(72/factor)} ${unit}`);return {type:'set-bleed',offsets};}).then(result=>{if(result?.status==='completed'&&result.bleedOffsets){dirty.current=false;setDraft(result.bleedOffsets.map(n=>format(n/factor)));}})}>应用出血</Button></div>
 </Card>;
}
