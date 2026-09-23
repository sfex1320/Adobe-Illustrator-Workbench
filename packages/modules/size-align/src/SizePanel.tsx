import { useRef, useState } from 'react';
import type { Bounds, ObjectTransform, QueryResult, ToolContribution } from '@aiq/contracts';
import type { Workspace, AlignMode } from '@aiq/core';
import { alignBounds, centeredBounds, distributeBounds } from '@aiq/core';
import { Button, Card, Field } from '@aiq/ui';
const ALIGN: Record<AlignMode,string> = {left:'左对齐','h-center':'水平居中',right:'右对齐',top:'顶对齐','v-center':'垂直居中',bottom:'底对齐'};

export function SizePanel({workspace}:{workspace:Workspace;tool?:ToolContribution}) {
  const [targets,setTargets] = useState<QueryResult|null>(null);
  const [unit,setUnit] = useState<'mm'|'pt'>('mm');
  const [width,setWidth] = useState('');
  const [height,setHeight] = useState('');
  const [proportional,setProportional] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);
  const canUndo = workspace.hasUndoableWrite();
  const running = useRef(false);
  const items = targets?.objects.filter(o=>o.kind==='path'&&!o.flags.clipPathFor&&o.bounds&&(o.bounds[2]-o.bounds[0])>0&&(o.bounds[3]-o.bounds[1])>0) ?? [];
  const read = async () => {
    workspace.invalidateSnapshots();
    const result=await workspace.resolveQuery({target:'objects',scope:{...workspace.currentScope(),kind:'selection',pierceGroups:true,pierceClipGroups:true,includeMaskPaths:false,includeHidden:false,includeLocked:false}});
    setTargets(result);return result;
  };
  const act = async (operation:()=>Promise<void>) => {
    if(running.current)return;running.current=true;setBusy(true);setMessage(null);setError(null);
    try{await operation();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{running.current=false;setBusy(false);}
  };
  const write = async (transforms:ObjectTransform[]) => {
    if(!targets||workspace.currentResult()?.requestId!==targets.requestId)throw Error('目标记录已改变，请重新读取选区。');
    if(!transforms.length)throw Error('没有可调整的普通路径。');
    const result=await workspace.applyTransforms(transforms);
    if(result.status!=='completed'&&result.status!=='partial')throw Error(result.error?.message??'调整未完成');
    setMessage(`已处理 ${transforms.length-result.skipped.length} 个对象${result.skipped.length?`，跳过 ${result.skipped.length} 个`:''}。`);
    await read();
  };
  const resize = async () => {
    const factor=unit==='mm'?72/25.4:1;
    const w=width.trim()?Number(width)*factor:undefined,h=height.trim()?Number(height)*factor:undefined;
    if(w===undefined&&h===undefined)throw Error('请输入宽度或高度。');
    if((w!==undefined&&(!Number.isFinite(w)||w<=0))||(h!==undefined&&(!Number.isFinite(h)||h<=0)))throw Error('宽高必须是大于零的数字。');
    if(proportional&&w!==undefined&&h!==undefined)throw Error('等比时只需填写宽或高；填写两项请关闭等比。');
    await write(items.map(o=>{const b=o.bounds!,ow=b[2]-b[0],oh=b[3]-b[1];const nw=w??(proportional?ow*h!/oh:ow),nh=h??(proportional?oh*w!/ow:oh);return {objectId:o.objectId,targetBounds:centeredBounds(b,nw,nh),keepProportions:proportional};}));
  };
  const align = async(mode:AlignMode) => {
    if(items.length<2)throw Error('对齐至少需要两个普通路径。');
    const reference:Bounds=[Math.min(...items.map(o=>o.bounds![0])),Math.min(...items.map(o=>o.bounds![1])),Math.max(...items.map(o=>o.bounds![2])),Math.max(...items.map(o=>o.bounds![3]))];
    await write(alignBounds(items.map(o=>({objectId:o.objectId,bounds:o.bounds!})),mode,reference).map(t=>({objectId:t.objectId,targetBounds:t.bounds,keepProportions:true})));
  };
  const distribute = async(direction:'horizontal'|'vertical')=>{
    if(items.length<3)throw Error('分布至少需要三个普通路径。');
    await write(distributeBounds(items.map(o=>({objectId:o.objectId,bounds:o.bounds!})),direction).map(t=>({objectId:t.objectId,targetBounds:t.bounds,keepProportions:true})));
  };
  return <>
    <section className="aiq-card"><div className="aiq-row"><Button variant="primary" icon="select" title="仅调整普通路径的锚点与控制柄，不改变描边宽度。组内路径逐个处理，蒙版路径、文字、复合路径不参与。" disabled={busy} onClick={()=>void act(async()=>{const r=await read();setMessage(r.objects.length?'选区已更新。':'当前选区为空，请先选择对象。');})}>读取当前选区</Button><span className="wb-inline-note">{items.length} 个可调整路径</span></div>
      {targets&&targets.objects.length>items.length&&<p className="wb-inline-note">已排除 {targets.objects.length-items.length} 个不支持的对象。</p>}
    </section>
    <Card title="统一尺寸" icon="size"><div className="wb-segments" style={{marginBottom:10}}>{(['mm','pt'] as const).map(u=><button key={u} aria-pressed={unit===u} onClick={()=>{setWidth('');setHeight('');setUnit(u);}}>{u}</button>)}</div><div className="wb-form-grid"><Field label={`宽度 ${unit}`}><input className="aiq-input" aria-label="目标宽度" value={width} placeholder="保持原宽" onChange={e=>setWidth(e.target.value)}/></Field><Field label={`高度 ${unit}`}><input className="aiq-input" aria-label="目标高度" value={height} placeholder="保持原高" onChange={e=>setHeight(e.target.value)}/></Field></div><div className="aiq-row" style={{marginTop:10}}><label className="aiq-switch"><input type="checkbox" checked={proportional} onChange={e=>setProportional(e.target.checked)}/>等比缩放</label><Button variant="primary" disabled={busy||!items.length} onClick={()=>void act(resize)}>应用尺寸</Button></div></Card>
    <Card title="对齐与分布" icon="size" help="以选区整体边界为参照。"><div className="wb-align-grid">{(Object.keys(ALIGN) as AlignMode[]).map(mode=><Button key={mode} disabled={busy||items.length<2} onClick={()=>void act(()=>align(mode))}>{ALIGN[mode]}</Button>)}</div><div className="aiq-row" style={{marginTop:8}}><Button disabled={busy||items.length<3} title="首尾保持不动，按中心点等距" onClick={()=>void act(()=>distribute('horizontal'))}>水平分布</Button><Button disabled={busy||items.length<3} title="首尾保持不动，按中心点等距" onClick={()=>void act(()=>distribute('vertical'))}>垂直分布</Button></div></Card>
    {error&&<p role="alert" className="aiq-error-text">{error}</p>}{message&&<p role="status" className="wb-inline-note">{message}</p>}
    <Button icon="undo" disabled={busy||!canUndo} title="仅恢复本面板最后一次路径调整；后续手动改过的路径不会被覆盖" onClick={()=>void act(async()=>{const r=await workspace.undoWrite();if(r.status!=='completed')throw Error(r.error?.message??'无法恢复');setMessage('已恢复上一次路径调整。');await read();})}>恢复上次调整</Button>
  </>;
}
