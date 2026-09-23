import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import type {RulerUnit} from '@aiq/contracts';
import {planArrangement,unitFactor} from '@aiq/core';
import type {ArrangementSettings,LayoutItem} from '@aiq/core';
import {usePreference} from './preference.js';
import type {PreferencePort} from './preference.js';
import {Button,Card,Field} from './components.js';
import {publishFeedback} from './feedback.js';
type Preset={name:string;settings:Omit<ArrangementSettings,'anchorId'>};
type Props={workspace?:PreferencePort;busy:boolean;unit:string;items?:LayoutItem[];previewMeasured?:boolean;anchorScope?:string;onArrange?:(settings:ArrangementSettings,linked:boolean)=>void;onApply?:(columns:number,rows:number,x:number,y:number,anchor:string,linked:boolean)=>void;anchorOptions:Array<[string,string]>;defaultAnchor?:string;artboards?:boolean;selection?:ReactNode};
const defaults=['4','1','0','0'];
const fmt=(n:number)=>String(Number(n.toFixed(2)));
const emptyPort:PreferencePort={};
function lengthFactor(unit:string){try{return unitFactor(unit as RulerUnit);}catch{return NaN;}}
export function Arrangement({workspace=emptyPort,busy,unit,items=[],previewMeasured=false,anchorScope,onArrange,onApply,anchorOptions,defaultAnchor,artboards=false,selection}:Props){
 const key=artboards?'arrangeBoards':'arrangeObjects';
 const [values,setValues]=usePreference(workspace,key+'.values',['4',String(Math.max(1,Math.ceil(anchorOptions.length/4))),'0','0']);
 const [order,setOrder]=usePreference<ArrangementSettings['order']>(workspace,key+'.order','horizontal',artboards?['horizontal','vertical','index']:['horizontal','vertical','layer']);
 const [sizing,setSizing]=usePreference<ArrangementSettings['sizing']>(workspace,key+'.sizing','keep',artboards?['keep']:['keep','width']);
 const [position,setPosition]=usePreference<ArrangementSettings['position']>(workspace,key+'.position','selection',['selection','anchor']);
 const [totalWidth,setTotalWidth]=usePreference(workspace,key+'.totalWidth','100');
 const [linked,setLinked]=usePreference(workspace,'arrangeBoards.linked',true),[presets,setPresets]=usePreference<Preset[]>(workspace,key+'.presets',[]);
 const [anchor,setAnchor]=useState(''),[presetName,setPresetName]=useState('');
 useEffect(()=>{setAnchor('');},[anchorScope]);
 const normalized=defaults.map((fallback,i)=>typeof values[i]==='string'?values[i]!:typeof values[i]==='number'?String(values[i]):fallback);
 const rememberUnit=()=>{if(unit)workspace.updateSettings?.({toolPreferences:{...workspace.getSettings?.().toolPreferences,[key+'.unit']:unit}});};
 const update=(i:number,value:string)=>{rememberUnit();setValues(defaults.map((_,j)=>j===i?value:normalized[j]!));};
 const anchorId=anchorOptions.some(([id])=>id===anchor)?anchor:anchorOptions.some(([id])=>id===defaultAnchor)?defaultAnchor!:anchorOptions[0]?.[0]||'';
 // Physical units change drafts locally. No document references are persisted.
 const previousUnit=useRef(String(workspace.getSettings?.().toolPreferences?.[key+'.unit']??unit));
 const scale=lengthFactor(unit);
 useEffect(()=>{
  if(!unit||!Number.isFinite(scale))return;
  const previous=previousUnit.current;previousUnit.current=unit;
  if(previous&&previous!==unit){const old=lengthFactor(previous);if(Number.isFinite(old)){setValues(v=>defaults.map((fallback,i)=>{const draft=String(v[i]??fallback);return i>=2&&draft.trim()&&Number.isFinite(Number(draft))?fmt(Number(draft)*old/scale):draft;}));setTotalWidth(v=>v.trim()&&Number.isFinite(Number(v))?fmt(Number(v)*old/scale):v);}}
  if(previous&&previous!==unit)workspace.updateSettings?.({toolPreferences:{...workspace.getSettings?.().toolPreferences,[key+'.unit']:unit}});
 },[key,scale,unit,workspace,setValues,setTotalWidth]);
 const settings:ArrangementSettings={columns:Number(normalized[0]),rows:Number(normalized[1]),columnGap:Number(normalized[2])*scale,rowGap:Number(normalized[3])*scale,order,sizing,position,anchorId:position==='anchor'?anchorId:undefined,totalWidth:Number(totalWidth)*scale};
 let plan:LayoutItem[]=[],previewError='';
 try{if(normalized.some(v=>!v.trim())||sizing==='width'&&!totalWidth.trim())throw Error('请填写完整排列参数');if(items.length)plan=planArrangement(items,settings,artboards);}catch(err){previewError=err instanceof Error?err.message:String(err);}
 const box=plan.reduce((b,o)=>[Math.min(b[0]!,o.bounds[0]),Math.min(b[1]!,o.bounds[1]),Math.max(b[2]!,o.bounds[2]),Math.max(b[3]!,o.bounds[3])],[Infinity,Infinity,-Infinity,-Infinity]),w=box[2]!-box[0]!,h=box[3]!-box[1]!;
 const safePresets=presets.filter(p=>p&&typeof p.name==='string'&&p.settings&&typeof p.settings==='object');
 const applyPreset=(p:Preset)=>{rememberUnit();const s=p.settings;if(![s.columns,s.rows,s.columnGap,s.rowGap].every(Number.isFinite))return;setValues([String(s.columns),String(s.rows),fmt(s.columnGap/scale),fmt(s.rowGap/scale)]);setOrder(s.order);setSizing(artboards?'keep':s.sizing);setPosition(s.position);setTotalWidth(fmt((s.totalWidth??100*scale)/scale));publishFeedback('已载入排列预设','');};
 return <Card title={artboards?'排列画板':'排列对象'} icon="modules" help={artboards?'按行数 × 列数分块；仅移动当前指定范围，未选画板保持不变。':'排列沿用上方字形边界与蒙版内可见内容选项；执行前重新测量，固定总宽会等比缩放对象与描边。'}>{selection}
  <Field label="排列顺序"><select className="aiq-select" aria-label="排列顺序" value={order} onChange={e=>setOrder(e.target.value as typeof order)} title="执行时按当前位置重新排序；横排每行从左向右，下一行从上向下；竖排每列从上向下，下一列向右。"><option value="horizontal">横排 Z 字型</option><option value="vertical">竖排 N 字型</option>{artboards?<option value="index">画板编号顺序</option>:<option value="layer">图层／叠放顺序</option>}</select></Field>
  {!artboards&&<Field label="排列尺寸"><select className="aiq-select" aria-label="排列尺寸" value={sizing} onChange={e=>setSizing(e.target.value as typeof sizing)}><option value="keep">保留原尺寸</option><option value="width">固定总宽 · 同行等高</option></select></Field>}
  {sizing==='width'&&<Field label={`固定总宽 ${unit}`}><input className="aiq-input" aria-label="排列固定总宽" inputMode="decimal" value={totalWidth} onChange={e=>{rememberUnit();setTotalWidth(e.target.value);}} title="每行（含不足一行）按该总宽等比缩放至同行等高，包含列间距。竖排按行数填列。"/></Field>}
  <div className="wb-arrangement-grid">{[0,2,1,3].map(i=>{const label=['列数','行数',`列间距 ${unit}`,`行间距 ${unit}`][i]!;return <Field key={label} label={label}><div className="wb-input-reset"><input className="aiq-input" aria-label={label} type="text" inputMode={i<2?'numeric':'decimal'} value={normalized[i]} onChange={e=>update(i,e.target.value)} title={i<2?artboards?'列数 × 行数为每个画板分区容量，多余画板向右续区':'横排按列数换行，竖排按行数换列；对象超出时继续排列':'间距不得小于零，避免对象重叠'}/><button title={`复位${label}`} aria-label={`复位${label}`} onClick={()=>update(i,i<2?'1':'0')}>↺</button></div></Field>;})}</div>
  <Field label="排列定位"><select className="aiq-select" aria-label="排列定位" value={position} onChange={e=>setPosition(e.target.value as typeof position)}><option value="selection">原选区左上角</option><option value="anchor">指定锚点中心不动</option></select></Field>
  {position==='anchor'&&anchorOptions.length>0&&<Field label="位置锚点"><select className="aiq-select" aria-label="排列锚点" value={anchorId} onChange={e=>setAnchor(e.target.value)}>{anchorOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>}
  {plan.length>0&&<div className="wb-arrangement-preview" title={previewMeasured?'当前示意使用缓存外框；执行时重新测量字形／蒙版可见边界，实际尺寸可能改变':'仅显示本地计算的排列，不修改画布；执行时复核当前选区与位置'}><svg role="img" aria-label="排列示意图" viewBox={`${box[0]!-w*.025} ${box[1]!-h*.025} ${w*1.05} ${h*1.05}`} style={{display:'block',width:'100%',height:112}}>{plan.slice(0,300).map((o,i)=><g key={o.id}><rect x={o.bounds[0]} y={o.bounds[1]} width={o.bounds[2]-o.bounds[0]} height={o.bounds[3]-o.bounds[1]} fill="currentColor" fillOpacity=".12" stroke="currentColor" vectorEffect="non-scaling-stroke"/>{plan.length<=40&&<text x={(o.bounds[0]+o.bounds[2])/2} y={(o.bounds[1]+o.bounds[3])/2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(o.bounds[2]-o.bounds[0],o.bounds[3]-o.bounds[1])*.32} fill="currentColor">{i+1}</text>}</g>)}</svg><output aria-label="排列预计尺寸">{previewMeasured?'外框估算':'预计'} {fmt(w/scale)} × {fmt(h/scale)} {unit} · {plan.length} 项{plan.length>300?'（图示前 300 项）':''}</output></div>}
  {previewError&&<p className="aiq-error-text" role="alert">{previewError}</p>}
  <div className="aiq-row">{artboards&&<label className="wb-check" title="按蒙版内可见范围确定唯一归属；行列容量分区，多余画板向右续区，分区间距至少 20 mm。"><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/>联动设计稿</label>}<Button disabled={busy||!anchorOptions.length||!!previewError||normalized.some(x=>!x.trim())} onClick={()=>{if(onArrange)onArrange(settings,linked);else onApply?.(Number(normalized[0]),Number(normalized[1]),Number(normalized[2]),Number(normalized[3]),anchorId,linked);}}>排列</Button></div>
  <details><summary>排列预设</summary><Field label="已存预设"><select className="aiq-select" aria-label="已存排列预设" value="" onChange={e=>{const p=safePresets[Number(e.target.value)];if(p)applyPreset(p);}}><option value="">选择预设…</option>{safePresets.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select></Field><div className="wb-control-action"><input className="aiq-input" aria-label="排列预设名称" placeholder="预设名称" maxLength={40} value={presetName} onChange={e=>setPresetName(e.target.value)}/><Button disabled={!presetName.trim()||!!previewError||!Number.isFinite(scale)} onClick={()=>{const {anchorId:ignored,...options}=settings;void ignored;setPresets([...safePresets.filter(p=>p.name!==presetName.trim()),{name:presetName.trim(),settings:options}].slice(-20));publishFeedback('已保存排列预设','');}}>保存预设</Button></div></details>
 </Card>;
}
