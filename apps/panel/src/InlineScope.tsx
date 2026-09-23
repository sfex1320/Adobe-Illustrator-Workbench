import { useEffect, useState } from 'react';
import type { QueryScope, QueryScopeKind } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
const LABELS: Record<QueryScopeKind,string> = {document:'文档',selection:'选区',artboard:'画板',layer:'图层'};
export function InlineScope({workspace}:{workspace:Workspace}) {
  const scope = workspace.currentScope();
  const session = workspace.getDocument()?.sessionId;
  const [choices,setChoices] = useState<{artboards:Array<{id:string;name:string}>;layers:string[]}>({artboards:[],layers:[]});
  useEffect(() => {
    let cancelled = false;
    if (scope.kind !== 'artboard' && scope.kind !== 'layer') return;
    void workspace.ensureSnapshot(scope).then(s => {if(!cancelled)setChoices({artboards:s.artboards,layers:[...new Set(s.objects.map(o=>o.hierarchicalPath[0]).filter((v):v is string=>!!v))]});}).catch(()=>undefined);
    return () => {cancelled=true;};
  }, [workspace,scope,session]);
  const apply = (patch:Partial<QueryScope>) => workspace.applyScope({...scope,...patch});
  return <section className="wb-scope" aria-label="查询范围">
    <div className="wb-scope-heading"><span>范围</span><div className="wb-segments">{(Object.keys(LABELS) as QueryScopeKind[]).map(kind=><button key={kind} aria-pressed={scope.kind===kind} onClick={()=>apply({kind,artboardId:undefined,layerName:undefined})}>{LABELS[kind]}</button>)}</div></div>
    {scope.kind==='artboard' && <div className="wb-choice-list">{choices.artboards.map(a=><button key={a.id} aria-pressed={a.id===scope.artboardId} onClick={()=>apply({artboardId:a.id})}>{a.name}</button>)}{!scope.artboardId&&<span className="wb-inline-note">请选择一个画板</span>}</div>}
    {scope.kind==='layer' && <div className="wb-choice-list">{choices.layers.map(name=><button key={name} aria-pressed={name===scope.layerName} onClick={()=>apply({layerName:name})}>{name}</button>)}{!scope.layerName&&<span className="wb-inline-note">请选择一个图层</span>}</div>}
    <div className="wb-scope-options">{([
      ['pierceGroups','跨组','查询组内的实际对象，不解组'],['pierceClipGroups','跨蒙版','查询剪切组内对象，不释放蒙版；不等于仅实际可见区域'],
      ['includeMaskPaths','蒙版路径','把蒙版路径本身也作为目标'],['includeHidden','隐藏','包含隐藏对象，但不自动取消隐藏'],['includeLocked','锁定','包含锁定对象，但不自动解锁'],
    ] as const).map(([key,label,hint])=><label key={key} title={hint}><input type="checkbox" checked={scope[key]} onChange={e=>apply({[key]:e.target.checked})}/>{label}</label>)}</div>
  </section>;
}
