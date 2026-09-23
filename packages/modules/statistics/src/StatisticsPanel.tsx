import {usePreference} from '@aiq/ui';
import { useCallback, useEffect, useState } from 'react';
import type { ToolContribution, TextStyleQuery } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Button, Icon } from '@aiq/ui';
import { colorCss, gradientCss } from './color-preview';
import { computeStatistics } from './compute';
import type { StatisticsResult } from './compute';

export function StatisticsPanel({workspace,tool}:{workspace:Workspace;tool?:ToolContribution}) {
  const [stats,setStats] = useState<StatisticsResult|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [colorRole,setColorRole]=usePreference<'any'|'fill'|'stroke'>(workspace,'statistics.colorRole','any'),[located,setLocated]=useState<{count:number;index:number;mode:'objects'|'locate-containers'}|null>(null),[message,setMessage]=useState('');
  const [inventory,setInventory] = usePreference(workspace,'statistics.inventory',false);
  const gradientPreviews = new Map((stats?.gradient.recipes??[]).flatMap(r=>r.instances.map(g=>[g.gradientId,gradientCss(g)] as const)));
  const visibleColors=(stats?.color.usedColors??[]).filter(c=>colorRole==='any'||(c.roleCounts?.[colorRole]??0)>0);
  const section = tool?.section ?? 'fonts';
  const load = useCallback(async(force=false)=>{
    setBusy(true);setError(null);
    try {const scope=workspace.currentScope();setStats(computeStatistics(await workspace.ensureSnapshot(scope,{forceRefresh:force,readOnly:true}),scope));}
    catch(e){setStats(null);setError(e instanceof Error?e.message:'统计失败');}
    finally{setBusy(false);}
  },[workspace]);
  useEffect(()=>{void load();const off=workspace.onScopeChange(()=>void load());const offDoc=workspace.events.on('document-changed',()=>setStats(null));return()=>{off();offDoc();};},[workspace,load]);
  const locate=async(mode:'objects'|'locate-containers',index?:number)=>{
    const r=await workspace.selectFromCurrentResult(mode,{focus:true,index});
    if(r.status!=='completed'&&r.status!=='partial')throw Error(r.error?.message??'定位失败');
    setMessage(`已定位 ${r.selectedObjectIds.length} 个对象${r.skipped.length?`，跳过 ${r.skipped.length} 项：${r.skipped[0]?.reason}`:''}${mode==='locate-containers'?'（选择所在文本框）':''}`);
  };
  const query = (filter:{textStyle?:TextStyleQuery;usesColorId?:string;usesGradientId?:string}) => {
    setBusy(true);setError(null);setMessage('');setLocated(null);
    void (async()=>{const mode=filter.textStyle?'locate-containers':'objects';const result=await workspace.resolveQuery({scope:workspace.currentScope(),target:filter.textStyle?'text-spans':'objects',objectsFilter:{...filter,colorRole}});const count=filter.textStyle?new Set(result.textSpans.map(s=>s.containerObjectId)).size:result.objects.length;if(count){await locate(mode,0);setLocated({count,index:0,mode});}else setMessage('当前范围没有匹配对象');})().catch(err=>setError(err instanceof Error?err.message:'定位失败')).finally(()=>setBusy(false));
  };
  const navigate=(index:number)=>{if(!located)return;setBusy(true);void locate(located.mode,index).then(()=>setLocated({...located,index})).catch(err=>setError(String(err))).finally(()=>setBusy(false));};
  return <section className="aiq-card">
    <h3 className="aiq-card-title">{tool?.title ?? '字体统计'}<Button icon="refresh" disabled={busy} onClick={()=>void load(true)} style={{marginLeft:'auto'}} title="重新读取当前文档">刷新</Button></h3>
    {message&&<p role="status" className="wb-inline-note">{message}</p>}{located&&<div className="wb-chips"><Button disabled={busy||located.index===0} onClick={()=>navigate(located.index-1)}>上一个</Button><span>{located.index+1} / {located.count}</span><Button disabled={busy||located.index>=located.count-1} onClick={()=>navigate(located.index+1)}>下一个</Button><Button disabled={busy} onClick={()=>{setBusy(true);void locate(located.mode).catch(err=>setError(String(err))).finally(()=>setBusy(false));}}>选择全部匹配</Button></div>}
    {error&&<p role="alert" className="aiq-error-text">{error}</p>}
    {!stats ? !error&&<p className="wb-inline-note">正在读取文档…</p> : <>
      <div className="wb-metrics">
        {section==='fonts'?<><div className="wb-metric"><strong>{stats.text.familyCount}</strong><span>字体家族</span></div><div className="wb-metric"><strong>{stats.text.familyStyleCount}</strong><span>款式组合</span></div></>:section==='colors'?<><div className="wb-metric"><strong>{visibleColors.length}</strong><span>已解析使用颜色</span></div><div className="wb-metric"><strong>{stats.color.swatchInventory.length}</strong><span>库存色板</span></div></>:<><div className="wb-metric"><strong>{stats.gradient.recipeCount}</strong><span>已使用配方</span></div><div className="wb-metric"><strong>{stats.gradient.instanceCount}</strong><span>对象使用实例</span></div></>}
      </div>
      {section==='fonts'&&<>
        {stats.text.families.map(f=><div className="wb-font-row" key={f.fontFamily}><strong>{f.fontFamily}</strong><small> · {f.spanCount} 个片段</small>{f.styles.map(style=><div key={style.fontStyle}><small>{style.fontStyle}</small><div className="wb-chips">{style.sizes.map(size=><button key={size.fontSizePt} title="查找该字体、款式与字号的文字片段，定位操作选择整个文本框。字号按格式片段计数，字体家族和款式分别统计。" disabled={busy} onClick={()=>query({textStyle:{fontFamily:f.fontFamily,fontStyle:style.fontStyle,fontSizePt:size.fontSizePt}})}>{size.fontSizePt} pt <small>× {size.spanCount}</small></button>)}</div></div>)}</div>)}
        {stats.text.families.length===0&&<p className="wb-inline-note">当前范围内没有可解析的文字。</p>}
      </>}
      {section==='colors'&&<><select className="aiq-select" aria-label="颜色用途" title="包含已解析文字的填色与描边。色块是屏幕示意，印刷效果以色彩管理为准。" value={colorRole} onChange={e=>setColorRole(e.target.value as typeof colorRole)}><option value="any">填色与描边</option><option value="fill">仅填色</option><option value="stroke">仅描边</option></select>
        {visibleColors.map(c=><div className="wb-stat-color-row" key={c.colorId}><button key={c.colorId} className="wb-list-button" disabled={busy} onClick={()=>query({usesColorId:c.colorId})} title={`查找同色对象；${c.kind}`}><span className="wb-color-swatch" aria-hidden="true" style={{background:gradientPreviews.get(c.colorId)??colorCss(c)}}/><span>{c.name??c.colorId}</span><small>{colorRole==='any'?c.useCount:c.roleCounts?.[colorRole]} 处</small></button></div>)}
        {visibleColors.length===0&&<p className="wb-inline-note">已解析范围内没有使用颜色。</p>}
        <Button onClick={()=>setInventory(!inventory)} aria-expanded={inventory} style={{marginTop:10}}>{inventory?'收起色板库存':'查看色板库存'}</Button>
        {inventory&&stats.color.swatchInventory.map((c,i)=><div className="wb-status-row" key={`${c.colorId}:${i}`}><span>{c.name??c.colorId}</span><span title="仅判断已解析对象的直接填描，不代表可安全删除">{c.usedDirectly?'使用中':'未发现直接使用'}</span></div>)}
      </>}
      {section==='gradients'&&<>
        {stats.gradient.recipes.map((r,index)=><div className="wb-font-row" key={r.recipeKey}><strong>{r.kind==='linear'?'线性':'径向'}渐变 {index+1}</strong>{r.instances.map(g=><button key={g.gradientId} className="wb-list-button" disabled={busy} onClick={()=>query({usesGradientId:g.gradientId})}><span className="wb-color-swatch" aria-hidden="true" style={{background:gradientCss(g)}}/><span>{g.name??'未命名渐变'}</span><small>{g.usedByObjectIds.length} 对象</small></button>)}</div>)}
        {stats.gradient.unresolved.length>0&&<p className="wb-inline-note">另有 {stats.gradient.unresolved.length} 种渐变无法解析。</p>}
        {stats.gradient.recipeCount===0&&<p className="wb-inline-note">当前范围没有已解析的渐变配方。</p>}
      </>}
      <p className="wb-inline-note" title={stats.coverage.notes.join('；')}><Icon name="info" size={12}/> {workspace.getHostInfo().adapterKind==='cep'?'部分内容覆盖，悬停查看统计范围。':`演示数据 · ${stats.coverage.skippedObjectCount} 个对象未解析`}</p>
    </>}
  </section>;
}
