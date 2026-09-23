import {usePreference} from '@aiq/ui';
import { useEffect, useRef, useState } from 'react';
import type { EditorAction, EditorResult, ToolContribution } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { unitFactor } from '@aiq/core';
import { Button, Card, Field, useEditor, EditorFeedback, Segments, TextSearch } from '@aiq/ui';
type Find = Extract<EditorAction,{type:'object-search'}>;
const criteria:Array<[Find['same'][number],string]>=[['fill','填充色'],['stroke','轮廓色'],['strokeWidth','轮廓粗细'],['kind','类型'],['size','大小'],['font','字体'],['fontSize','字号']];
export function EditorSelectionPanel({workspace,tool}:{workspace:Workspace;tool?:ToolContribution}) {
 return tool?.id==='text'||tool?.id==='style'?<TextSearch key={tool.id} workspace={workspace} fontMode={tool.id==='style'}/>:<ObjectSearch workspace={workspace}/>;
}
function ObjectSearch({workspace}:{workspace:Workspace}) {
 const e=useEditor(workspace,'document'),[same,setSame]=usePreference<Find['same']>(workspace,'selection.same',[]),[scope,setScope]=usePreference<Find['scope']>(workspace,'selection.scope','document'),[excludeGroups,setExcludeGroups]=usePreference(workspace,'selection.excludeGroups',true),[tolerance,setTolerance]=usePreference(workspace,'selection.tolerance','0'),[width,setWidth]=usePreference(workspace,'selection.width',''),[height,setHeight]=usePreference(workspace,'selection.height',''),[sizeCompare,setSizeCompare]=usePreference<Find['sizeCompare']>(workspace,'selection.sizeCompare','equal'),[name,setName]=usePreference(workspace,'selection.name',''),[result,setResult]=useState<EditorResult|null>(null),[page,setPage]=useState(0),generation=useRef(0);
 const doc=e.state?.docSessionId,unit=e.state?.rulerUnit;
 useEffect(()=>{generation.current++;setResult(null);setPage(0);},[doc,unit,same,scope,excludeGroups,tolerance,width,height,sizeCompare,name]);
 const run=async(operation:Find['operation'],indexes?:number[])=>{
  const visit=generation.current;const r=await e.act(state=>{const factor=unitFactor(state.rulerUnit);if(!tolerance.trim()||!Number.isFinite(Number(tolerance))||Number(tolerance)<0)throw Error('容差须为非负数字');for(const v of [width,height])if(v.trim()&&(!Number.isFinite(Number(v))||Number(v)<=0))throw Error('尺寸须为大于零的数字');return {type:'object-search',operation,scope,same,excludeGroups,tolerance:Number(tolerance)*factor,width:width.trim()?Number(width)*factor:undefined,height:height.trim()?Number(height)*factor:undefined,sizeCompare,name,searchToken:result?.searchToken,matchIndexes:indexes};});if(visit===generation.current&&operation==='find'&&r){setResult(r);setPage(0);}
 };
 return <Card title="条件筛选" icon="search" help="所勾条件同时匹配；宽高留空则不限，勾选“大小”时以参考对象比较。选中局部文字时按字符样式查找，点击结果定位字符，全部选择框选所在文本框。隐藏、锁定及蒙版路径跳过；不改变群组结构。">
  <Segments label="对象查找范围" value={scope} onChange={setScope} options={[["document","整个文档"],["selection","所选对象 / 群组"],["artboard","当前画板"],["layer","当前图层"]]}/>
  <Field label="选择相同" help="先选参考对象或局部文字，按勾选属性同时匹配。"><div className="wb-scope-options">{criteria.map(([key,label])=><label key={key}><input type="checkbox" checked={same.includes(key)} onChange={v=>setSame(v.target.checked?[...same,key]:same.filter(k=>k!==key))}/>{label}</label>)}</div></Field>
  <label className="wb-check" title="只排除容器群组，仍查找组内对象。"><input type="checkbox" checked={excludeGroups} onChange={v=>setExcludeGroups(v.target.checked)}/>排除容器群组</label>
  <div className="wb-form-grid"><Field label={`宽 ${unit??''}`}><input className="aiq-input" aria-label="筛选宽度" inputMode="decimal" value={width} onBlur={()=>{if(width.trim()&&Number.isFinite(Number(width)))setWidth(String(Number(Number(width).toFixed(2))));}} onChange={v=>setWidth(v.target.value)} placeholder="不限"/></Field><Field label={`高 ${unit??''}`}><input className="aiq-input" aria-label="筛选高度" inputMode="decimal" value={height} onBlur={()=>{if(height.trim()&&Number.isFinite(Number(height)))setHeight(String(Number(Number(height).toFixed(2))));}} onChange={v=>setHeight(v.target.value)} placeholder="不限"/></Field></div>
  <Segments label="尺寸比较" value={sizeCompare} onChange={setSizeCompare} options={[["equal","等于"],["greater","大于"],["less","小于"]]}/>
  <div className="wb-form-grid"><Field label={`尺寸 / 线宽容差 ±${unit??''}`}><input className="aiq-input" aria-label="筛选容差" inputMode="decimal" value={tolerance} onChange={v=>setTolerance(v.target.value)}/></Field><Field label="名称包含"><input className="aiq-input" value={name} onChange={v=>setName(v.target.value)}/></Field></div>
  <Button variant="primary" disabled={e.busy} onClick={()=>void run('find')}>查找</Button>
  {result&&<><p role="status">匹配 {result.matchCount??0} {result.matchKind==='text'?'处文字':'个对象'}</p><Button disabled={e.busy||!result.matchCount} onClick={()=>void run('select')}>{result.matchKind==='text'?'框选所有匹配文本框':'选择全部匹配对象'}</Button><div className="wb-search-results">{result.matches?.slice(page*60,(page+1)*60).map(m=><div className="wb-search-hit" key={m.index}><button disabled={e.busy} onClick={()=>void run('locate',[m.index])}>{m.index+1}. {m.preview}</button></div>)}</div><div className="aiq-row"><Button disabled={!page} onClick={()=>setPage(page-1)}>上一页</Button><Button disabled={(page+1)*60>=(result.matchCount??0)} onClick={()=>setPage(page+1)}>下一页</Button></div></>}
  <EditorFeedback message={e.message} error={e.error}/>
 </Card>;
}
