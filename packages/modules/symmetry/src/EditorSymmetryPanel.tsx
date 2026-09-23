import { useEffect, useState } from 'react';
import type { Workspace } from '@aiq/core';
import { Button, Card, Field, Segments, useEditor, EditorFeedback } from '@aiq/ui';
export function EditorSymmetryPanel({workspace}:{workspace:Workspace}) {
 const e=useEditor(workspace),[axis,setAxis]=useState<'x'|'y'>('x'),[position,setPosition]=useState('0'),[side,setSide]=useState<'low'|'high'>('low'),[paused,setPaused]=useState(true);
 const live=!!e.state?.symmetryPreview;
 useEffect(()=>{
   if(e.state?.symmetry){setAxis(e.state.symmetry.axis);setPosition(String(e.state.symmetry.position));setSide(e.state.symmetry.side);}
   else if(e.state?.bounds)setPosition(String((e.state.bounds[0]+e.state.bounds[2])/2));
 },[e.state]);
 useEffect(()=>{
   const pause=()=>setPaused(true),hide=()=>{if(document.hidden)pause();};
   document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',pause);window.addEventListener('blur',pause);
   return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',pause);window.removeEventListener('blur',pause);};
 },[]);
 const update=(phase:'preview'|'sync')=>void e.act({type:'symmetry',phase,axis,position:Number(position),side}).then(r=>{if(r)setPaused(false);else setPaused(true);});
 return <Card title="单侧对称" icon="mirror" help="自动跟随关闭。拖动画布轴线后点击“更新画布预览”；修改下方参数后点击“应用参数”。复杂选区仅在明确操作时重建。">
  <Button disabled={e.busy} onClick={()=>void e.read()}>读取当前选区与预览</Button>
  <div className="wb-space"><Segments label="对称方向" value={axis} onChange={setAxis} options={[["x","左右对称"],["y","上下对称"]]}/></div>
  <div className="wb-space"><Segments label="保留侧" value={side} onChange={setSide} options={[["low",axis==='x'?'保留左侧':'保留上侧'],["high",axis==='x'?'保留右侧':'保留下侧']]}/></div>
  <Field label="对称轴位置 pt"><input className="aiq-input" aria-label="对称轴位置" type="number" value={position} onChange={v=>setPosition(v.target.value)}/></Field>
  <div className="aiq-row wb-space">{!live?<Button variant="primary" disabled={e.busy||!e.state?.objects.length} onClick={()=>update('preview')}>开始预览</Button>:<>
    <Button disabled={e.busy} onClick={()=>setPaused(!paused)}>{paused?'继续预览':'暂停预览'}</Button>
    <Button disabled={e.busy||paused} onClick={()=>update('sync')}>更新画布预览</Button>
    <Button disabled={e.busy||paused} onClick={()=>update('preview')}>应用参数</Button>
    <Button disabled={e.busy} variant="primary" onClick={()=>void e.act({type:'symmetry',phase:'commit',axis,position:Number(position),side})}>保留结果</Button>
    <Button disabled={e.busy} onClick={()=>void e.act({type:'symmetry',phase:'cancel',axis,position:Number(position),side})}>取消并还原</Button>
  </>}</div>
  {live&&<p role="status" className="wb-inline-note">{paused?'预览已暂停，现有内容保留。':'手动预览中，不执行后台跟随。'}</p>}
  <EditorFeedback message={e.message} error={e.error}/>
 </Card>;
}
