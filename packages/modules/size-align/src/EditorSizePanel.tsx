import {usePreference} from '@aiq/ui';
import { Arrangement } from './Arrangement';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { unitFactor, planArrangement, mapMeasuredArrangement, parseNumberExpression } from '@aiq/core';
import type { Workspace, AlignMode } from '@aiq/core';
import { alignBounds, overallBounds, resizeEditorObjects, distributeEditorObjects } from '@aiq/core';
import type { EditorAction, EditorState } from '@aiq/contracts';
import { Button, Card, Field, useEditor, EditorFeedback, Segments } from '@aiq/ui';
const modes:Array<[AlignMode[],string,string]>=[[['left','top'],'左上对齐','↖'],[['top'],'上对齐','↑'],[['right','top'],'右上对齐','↗'],[['left'],'左对齐','←'],[['h-center','v-center'],'水平垂直居中','⊕'],[['right'],'右对齐','→'],[['left','bottom'],'左下对齐','↙'],[['bottom'],'下对齐','↓'],[['right','bottom'],'右下对齐','↘']];
export function EditorSizePanel({workspace}:{workspace:Workspace}) {
 const saved=workspace.getSettings?.().sizePreferences;
 const e=useEditor(workspace,'selection',{autoRefresh:true}),[width,setWidth]=useState(()=>saved?.width?.trim()&&Number.isFinite(Number(saved.width))?String(Number(Number(saved.width).toFixed(2))):saved?.width??''),[height,setHeight]=useState(()=>saved?.height?.trim()&&Number.isFinite(Number(saved.height))?String(Number(Number(saved.height).toFixed(2))):saved?.height??''),[together,setTogether]=useState<'each'|'all'>(saved?.together??'each'),[reference,setReference]=usePreference<'selection'|'artboard'|'native'>(workspace,'align.reference','native'),[clipBounds,setClipBounds]=usePreference<'frame'|'visible'>(workspace,'align.clipBounds','frame',['frame','visible']),[textBounds,setTextBounds]=usePreference<'frame'|'glyph'>(workspace,'align.textBounds','frame',['frame','glyph']),[layoutBusy,setLayoutBusy]=useState(false),[layoutMessage,setLayoutMessage]=useState(''),[gap,setGap]=usePreference(workspace,'align.gap',''),[referenceId,setReferenceId]=useState(''),[types,setTypes]=usePreference(workspace,'align.types',{text:true,shape:true,group:true}),[error,setError]=useState('');
 const [includeBleed,setIncludeBleed]=useState(saved?.includeBleed??false);
 const measuring=useRef(false);
 const unit='auto';const resolvedUnit=e.state?.rulerUnit??saved?.valueUnit;const factor=resolvedUnit?unitFactor(resolvedUnit):NaN;
 const selectionKey=e.state?.selectionKey;useEffect(()=>{setReferenceId('');},[selectionKey]);
 const widthInput=useRef<HTMLInputElement>(null),heightInput=useRef<HTMLInputElement>(null),restoreSelection=useRef<HTMLInputElement|null>(null);
 const priorFactor=useRef(saved?.valueUnit?unitFactor(saved.valueUnit):factor);useEffect(()=>{if(!Number.isFinite(factor))return;const old=priorFactor.current;priorFactor.current=factor;if(Number.isFinite(old)&&old!==factor){
  const focused=[widthInput.current,heightInput.current].find(input=>input&&document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length);
  restoreSelection.current=focused??null;
  const convert=(v:string)=>{if(!v.trim())return v;try{return String(Number((parseNumberExpression(v)*old/factor).toFixed(2)));}catch{return v;}};
  setWidth(convert);setHeight(convert);
 }},[factor]);
 useLayoutEffect(()=>{const input=restoreSelection.current;restoreSelection.current=null;if(input&&document.activeElement===input)input.select();},[width,height]);
 const normalize=(draft:string,set:(value:string)=>void)=>{if(!draft.trim())return;try{set(String(Number(parseNumberExpression(draft).toFixed(2))));setError('');}catch(err){setError(err instanceof Error?err.message:String(err));}};
 const getItems=(state:EditorState|null)=>(state?.objects??[]).filter(o=>o.kind.startsWith('text-')?types.text:o.kind==='group'?types.group:types.shape);
 const items=getItems(e.state);
 // Target dimensions are user-owned. Host selection/board changes must never refill them.
 useEffect(()=>{workspace.updateSettings?.({sizePreferences:{width,height,unit,valueUnit:resolvedUnit,proportion:null,together,includeBleed}});},[workspace,width,height,unit,resolvedUnit,together,includeBleed]);
 const invoke=(fn:(s:EditorState,signal:AbortSignal)=>EditorAction|Promise<EditorAction>)=>{setError('');void e.act(fn);};
 const boardSize=(state:EditorState)=>{
  const b=state.artboards[state.activeArtboard]?.bounds;if(!b)throw Error('没有画板');
  let w=b[2]-b[0],h=b[3]-b[1];
  if(includeBleed){
   const offsets=workspace.getDocumentBleed?.();
   if(!offsets||offsets.length!==4||offsets.some(n=>!Number.isFinite(n)||n<0))throw Error('当前文档出血不可用，请检查原生模块或取消包含出血');
   w+=offsets[0]!+offsets[2]!;h+=offsets[1]!+offsets[3]!;
  }
  return [w,h] as const;
 };
 const measure=async(source:'selection'|'artboard')=>{
  if(measuring.current||e.busy||layoutBusy)return;measuring.current=true;setLayoutBusy(true);setError('');
  try{const state=await e.read();if(!state)throw Error('无法读取当前文档');
   const actualUnit=unit==='auto'?state.rulerUnit:unit,scale=unitFactor(actualUnit);
   let size:readonly[number,number];
   if(source==='artboard')size=boardSize(state);
   else{const b=overallBounds(getItems(state));size=[b[2]-b[0],b[3]-b[1]];}
   priorFactor.current=scale;setWidth(String(Number((size[0]/scale).toFixed(2))));setHeight(String(Number((size[1]/scale).toFixed(2))));
  }catch(err){setError(err instanceof Error?err.message:String(err));}finally{measuring.current=false;setLayoutBusy(false);}
 };
 const applySize=(axis:'width'|'height'|null=null)=>{
  invoke(state=>{const scale=Number.isFinite(factor)?factor:unitFactor(unit==='auto'?state.rulerUnit:unit);const useWidth=!!width.trim()&&axis!=='height',useHeight=!!height.trim()&&axis!=='width';
   if(axis==='width'&&!width.trim()||axis==='height'&&!height.trim())throw Error('请填写等比方向的尺寸');
   return {type:'geometry',transforms:resizeEditorObjects(getItems(state),useWidth?parseNumberExpression(width)*scale:undefined,useHeight?parseNumberExpression(height)*scale:undefined,axis!==null,together==='all')};
  });
 };
 const busy=e.busy||layoutBusy;
 const alignBleed=(axes:AlignMode[])=>invoke(async(state,signal)=>{
  if(state.objects.length!==1)throw Error('右键出血对齐请只选择一个对象或一个完整群组');
  const board=state.artboards[state.activeArtboard]?.bounds,bleed=state.bleedOffsets;
  if(!board||!bleed||bleed.length!==4||bleed.some(v=>!Number.isFinite(v)||v<0))throw Error('当前画板出血不可用，请检查原生模块后重试');
  const result=await workspace.editDocument(state,{type:'measure-layout',clip:clipBounds,text:textBounds},signal);
  if(result.status!=='completed'||result.measuredObjects?.length!==1)throw Error(result.error?.message??'无法测量所选对象');
  const original=state.objects[0]!,measured=result.measuredObjects[0]!,before=measured.bounds;
  const referenceBox=[board[0]-bleed[0]!,board[1]-bleed[1]!,board[2]+bleed[2]!,board[3]+bleed[3]!] as typeof board;
  let after=before;for(const mode of axes)after=alignBounds([{objectId:original.id,bounds:after}],mode,referenceBox)[0]!.bounds;
  const dx=after[0]-before[0],dy=after[1]-before[1],b=original.bounds;
  return {type:'geometry',transforms:[{id:original.id,bounds:[b[0]+dx,b[1]+dy,b[2]+dx,b[3]+dy]}]};
 });
 const layout=async(axes:AlignMode[]|null,axis?:'horizontal'|'vertical',edge?:'start'|'end'|'centers')=>{
  const distribution=edge??'gaps';if(busy)return;setError('');setLayoutMessage('');setLayoutBusy(true);
  try{
   if(reference==='native'){if(!types.text||!types.shape||!types.group)throw Error('自动原生模式参与整个选区；按类型筛选请改用选区边界或当前画板');await e.act(axes?{type:'native-align',axes,clip:clipBounds,text:textBounds,referenceId:referenceId||undefined}:{type:'native-align',clip:clipBounds,text:textBounds,distribute:axis,spacing:distribution==='start'||distribution==='end'?'centers':distribution,edge:edge==='centers'?undefined:edge,gap:distribution==='gaps'&&gap.trim()?parseNumberExpression(gap)*factor:undefined,referenceId:referenceId||undefined});return;}
   const state=await workspace.readEditorState('selection');if(!state)throw Error('没有文档');
   const result=await workspace.editDocument(state,{type:'measure-layout',clip:clipBounds,text:textBounds});
   if(result.status!=='completed'||!result.measuredObjects)throw Error(result.error?.message??'无法测量边界');
   let measured=getItems({...state,objects:result.measuredObjects});const originals=getItems(state);
   if(!measured.length)throw Error('当前筛选没有参与对象');
   const referenceBox=reference==='artboard'?state.artboards[state.activeArtboard]!.bounds:overallBounds(measured);
   const before=measured;
   if(axes){for(const mode of axes){const transformed=alignBounds(measured.map(o=>({objectId:o.id,bounds:o.bounds})),mode,referenceBox);measured=measured.map(o=>({...o,bounds:transformed.find(t=>t.objectId===o.id)!.bounds}));}}
   else{const transformed=distributeEditorObjects(measured,axis!,distribution,distribution==='gaps'&&gap.trim()?parseNumberExpression(gap)*factor:undefined);measured=measured.map(o=>({...o,bounds:transformed.find(t=>t.id===o.id)!.bounds}));}
   const transforms=measured.map(o=>{const old=before.find(b=>b.id===o.id)!.bounds,normal=originals.find(b=>b.id===o.id)!.bounds,dx=o.bounds[0]-old[0],dy=o.bounds[1]-old[1];return {id:o.id,bounds:[normal[0]+dx,normal[1]+dy,normal[2]+dx,normal[3]+dy] as typeof normal};});
   const r=await workspace.editDocument(state,{type:'geometry',transforms});if(r.status!=='completed')throw Error(r.error?.message??'调整未完成');setLayoutMessage('已按所选边界调整 '+transforms.length+' 个对象');await e.read();
  }catch(err){setError(err instanceof Error?err.message:String(err));}finally{setLayoutBusy(false);}
 };
 return <><EditorFeedback message={layoutMessage||e.message} error={error||e.error}/>
 <Card title="统一尺寸" icon="size"><div className="wb-size-tools"><Segments label="尺寸模式" value={together} onChange={setTogether} options={[["each","逐个"],["all","整体"]]}/>
 <Button icon="select" aria-label="对象尺寸" title="把所选对象整体的宽高填入下方输入框" disabled={busy} onClick={()=>void measure('selection')}>对象</Button><Button icon="size" aria-label="画板尺寸" title="把当前画板的宽高填入下方输入框" disabled={busy} onClick={()=>void measure('artboard')}>画板</Button><Button icon="size" className="aiq-button wb-fit-artboard" title="按当前画板宽高直接统一选区整体尺寸（可含出血）" disabled={busy} onClick={()=>invoke(state=>{const targets=getItems(state);if(!targets.length)throw Error('没有选择对象');const [w,h]=boardSize(state);return {type:'geometry',transforms:resizeEditorObjects(targets,w,h,false,true)};})} aria-label="适配画板"/></div>
 <label className="wb-check"><input type="checkbox" checked={includeBleed} disabled={busy} onChange={v=>setIncludeBleed(v.target.checked)}/>画板尺寸包含文档出血</label>
 <p className="wb-inline-note">尺寸单位：{resolvedUnit??"等待同步"}（跟随文档）</p>
 <div className="wb-size-row"><Field label={`宽 ${resolvedUnit??''}`}><input className="aiq-input wb-num-input" aria-label="目标宽度" ref={widthInput} title="支持数字、四则运算和括号，例如 (210+6)/2" inputMode="decimal" onBlur={()=>normalize(width,setWidth)} value={width} onChange={v=>{setWidth(v.target.value);}}/></Field><Field label={`高 ${resolvedUnit??''}`}><input className="aiq-input wb-num-input" aria-label="目标高度" ref={heightInput} title="支持数字、四则运算和括号，例如 (210+6)/2" inputMode="decimal" onBlur={()=>normalize(height,setHeight)} value={height} onChange={v=>{setHeight(v.target.value);}}/></Field><div className="wb-size-apply"><Button disabled={busy} onClick={()=>applySize('width')}>↔ 按宽应用</Button><Button disabled={busy} onClick={()=>applySize('height')}>↕ 按高应用</Button><Button variant="primary" disabled={busy} onClick={()=>applySize()}>应用尺寸</Button></div></div></Card>
 <Card title={`对齐与分布 · ${items.length} 个参与对象`} icon="size"><div className="wb-scope-options">{(['text','shape','group'] as const).map(k=><label key={k}><input type="checkbox" checked={types[k]} onChange={v=>setTypes({...types,[k]:v.target.checked})}/>{({text:'文字框',shape:'图形 / 转曲文字',group:'群组整体'})[k]}</label>)}</div>
 <Segments label="对齐参照" value={reference} onChange={setReference} options={[["native","自动"],["selection","选区边界"],["artboard","当前画板"]]}/><div className="wb-boundary-toggles" role="group" aria-label="对齐测量边界"><Button icon="text" aria-label="对齐字形边界" aria-pressed={textBounds==='glyph'} disabled={busy} title={textBounds==='glyph'?'已开启：按字形边界对齐点文字和区域文字；再次点击改用文字外框':'未开启：按文字外框对齐；点击改用字形边界'} onClick={()=>setTextBounds(textBounds==='glyph'?'frame':'glyph')}>字形边界</Button><Button icon="select" aria-label="对齐蒙版内可见内容" aria-pressed={clipBounds==='visible'} disabled={busy} title={clipBounds==='visible'?'已开启：按蒙版内可见内容测量；再次点击改用蒙版外框。可见内容目前支持矩形蒙版':'未开启：按蒙版外框对齐；点击改用蒙版内可见内容'} onClick={()=>setClipBounds(clipBounds==='visible'?'frame':'visible')}>蒙版内可见</Button></div>{reference==='native'&&items.length>1&&<details className="wb-advanced-reference"><summary title="默认采用最后观察到的单次新增对象；未识别时可在这里指定">指定目标</summary><Field label="固定目标"><select className="aiq-select" value={referenceId} onChange={v=>setReferenceId(v.target.value)}><option value="">自动识别参考对象</option>{items.map((o,i)=><option key={o.id} value={o.id}>对象 {i+1}{e.state?.lastSelectedId===o.id?' · 最后选择':''}</option>)}</select></Field></details>}<div className="wb-alignment" role="group" aria-label="对齐位置"><div className="wb-align-nine">{modes.map(([axes,label])=><Button key={label} title={label+"；右键：对齐当前画板出血（单对象）"} aria-label={label} disabled={busy} onClick={()=>void layout(axes)} onContextMenu={event=>{event.preventDefault();if(!busy)alignBleed(axes);}}><AlignmentIcon axes={axes}/></Button>)}</div><div className="wb-align-centers">{([[['h-center'],'水平居中对齐'],[['v-center'],'垂直居中对齐']] as Array<[AlignMode[],string]>).map(([axes,label])=><Button key={label} title={label+"；右键：对齐当前画板出血（单对象）"} aria-label={label} disabled={busy} onClick={()=>void layout(axes)} onContextMenu={event=>{event.preventDefault();if(!busy)alignBleed(axes);}}><AlignmentIcon axes={axes}/></Button>)}</div></div><div className="wb-edge-distribution" role="group" aria-label="分布对象">{([['vertical','start','顶部分布'],['vertical','centers','垂直中心分布'],['vertical','end','底部分布'],['horizontal','start','左侧分布'],['horizontal','centers','水平中心分布'],['horizontal','end','右侧分布']] as const).map(([axis,edge,label])=><Button key={label} title={label} aria-label={label} disabled={busy} onClick={()=>void layout(null,axis,edge)}><DistributionIcon axis={axis} edge={edge}/></Button>)}</div><div className="wb-gap-row"><Field label={`间距 ${resolvedUnit??''}`}><input className="aiq-input" aria-label="分布间距" title="留空自动等距；指定间距固定最后选择或最左／最上对象" placeholder="自动" type="text" inputMode="decimal" value={gap} onChange={v=>setGap(v.target.value)}/></Field><div className="wb-gap-actions">{(['horizontal','vertical'] as const).map(axis=><Button key={axis} title={axis==='horizontal'?'水平分布':'垂直分布'} aria-label={axis==='horizontal'?'水平分布':'垂直分布'} disabled={busy} onClick={()=>void layout(null,axis)}><DistributionIcon axis={axis}/><span>{axis==='horizontal'?'水平分布':'垂直分布'}</span></Button>)}</div></div></Card>
 <Arrangement workspace={workspace} busy={busy} unit={resolvedUnit??''} items={items} anchorScope={e.state?.docSessionId+':'+selectionKey} previewMeasured={textBounds==='glyph'||clipBounds==='visible'} anchorOptions={items.map((o,i)=>[o.id,`对象 ${i+1}`])} defaultAnchor={e.state?.lastSelectedId} onArrange={settings=>invoke(async(state,signal)=>{
  if(settings.position==='anchor'&&selectionKey&&state.selectionKey!==selectionKey)throw Error('选区已改变，请重新指定排列锚点');
  const originals=getItems(state);if(!originals.length)throw Error('当前筛选没有参与对象');
  const result=await workspace.editDocument(state,{type:'measure-layout',clip:clipBounds,text:textBounds},signal);
  if(result.status!=='completed'||!result.measuredObjects)throw Error(result.error?.message??'无法测量排列边界');
  const measured=getItems({...state,objects:result.measuredObjects}).map(o=>({...o,stackOrder:originals.find(source=>source.id===o.id)?.stackOrder}));
  if(measured.length!==originals.length)throw Error('测量范围已改变，请重新选择');
  return {type:'geometry',scaleStrokes:settings.sizing==='width',transforms:mapMeasuredArrangement(originals,measured,planArrangement(measured,settings))};
 })}/>
 </>;
}

function AlignmentIcon({axes}:{axes:AlignMode[]}){const x=axes.includes('left')?4:axes.includes('right')?14:9,y=axes.includes('top')?4:axes.includes('bottom')?14:9;return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{axes.includes('left')&&<path d="M2 2v20"/>}{axes.includes('right')&&<path d="M22 2v20"/>}{axes.includes('top')&&<path d="M2 2h20"/>}{axes.includes('bottom')&&<path d="M2 22h20"/>}{axes.includes('h-center')&&<path d="M12 1v22" strokeDasharray="2 2"/>}{axes.includes('v-center')&&<path d="M1 12h22" strokeDasharray="2 2"/>}<rect x={x} y={y} width="6" height="6" rx="1" fill="currentColor"/></svg>;}

function DistributionIcon({axis,edge}:{axis:'horizontal'|'vertical';edge?:'start'|'end'|'centers'}){return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><g transform={axis==='vertical'?'rotate(90 12 12)':undefined}>{[3,10,18].map((x,i)=><g key={x}><rect x={x} y={5+i%2*3} width={i===1?5:3} height={14-i%2*6}/>{edge&&<path d={`M${x+(edge==='end'?(i===1?5:3):edge==='centers'?(i===1?2.5:1.5):0)} 2v20`} strokeDasharray="2 2"/>}</g>)}{!edge&&<path d="M2 2h20M2 0v4M22 0v4"/>}</g></svg>;}
