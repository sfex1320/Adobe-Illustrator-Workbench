import { useEffect, useState } from 'react';
import type { Workspace } from '@aiq/core';
import type { ExportProgress } from '@aiq/contracts';
import { Button, publishFeedback } from '@aiq/ui';

/** Reads only a small status file while this panel owns a running export. */
export function ExportJobStatus({workspace,jobId,running,result}:{workspace:Workspace;jobId:string;running:boolean;result:ExportProgress|null}) {
 const [progress,setProgress]=useState<ExportProgress|null>(null),[requested,setRequested]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setProgress(null);setRequested(false);setError('');if(!jobId||!workspace.supportsExportProgress?.())return;
   let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
   const read=async()=>{try{const value=await workspace.readExportProgress(jobId);if(alive&&value)setProgress(value);}catch{/* keep last complete record */}
     if(alive&&(running||workspace.isExportRunning?.(jobId)))timer=setTimeout(()=>void read(),1000);
   };void read();return()=>{alive=false;clearTimeout(timer);};
 },[workspace,jobId,running]);
 const p=result?.jobId===jobId?result:progress;
 useEffect(()=>{if(running&&typeof p?.message==='string')publishFeedback(p.message,'');},[running,p?.message]);
 if(!jobId||!p&&!running)return null;
 const status=p?.status??'running',active=running||workspace.isExportRunning?.(jobId);
 const labels:Record<string,string>={preparing:'检查导出范围',snapshot:'准备保护副本',opening:'打开保护副本',pdf:'准备中间页',prepared:'准备完成',rendering:'独立渲染',encoding:'编码',validating:'检查输出',publishing:'交付成品','host-uncertain':'宿主尚未确认结束'};
 const label=status==='running'?(p?.phase&&labels[p.phase]|| (active?'正在导出':'上次任务未确认完成')):({completed:'导出完成',partial:'部分完成',cancelled:'已取消',failed:'导出失败'}[status]);
 const end=status==='running'?Date.now():p?.updatedAt;
 const elapsed=p?.startedAt&&Number.isFinite(p.startedAt)&&end!==undefined?Math.max(0,Math.floor((end-p.startedAt)/1000)):null;
 return <div className="wb-export-progress" role="status"><span>{label}{p?` · 已交付 ${p.completed}/${p.total} 项${p.failed?` · 失败 ${p.failed} 项`:''}`:''}</span>
 <progress aria-label="文件交付进度" max={p?.total||1} value={p?Math.min(p.completed,p.total):undefined}/>
 {active&&p?.completed===0&&<span>正在{p.phase&&labels[p.phase]||'处理'}；进度按实际交付文件计数</span>}
 {p?.prepared!==undefined&&<span>中间页 {p.prepared}/{p.total}{elapsed!==null?` · 已耗时 ${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`:''}</span>}
 {active&&status==='running'&&<Button disabled={requested} onClick={()=>{setRequested(true);void workspace.cancelExport(jobId).catch(err=>{setRequested(false);setError(String(err));});}}>{requested?'已请求取消，等待安全检查点':'取消后续导出'}</Button>}
 {error&&<span role="alert">{error}</span>}
 {!active&&status==='running'&&<span>上次调用的完成状态未知，请先核对任务；不会自动重试宿主操作。</span>}
 {p?.message&&(!active||p.phase==='host-uncertain')&&<span>{p.message}</span>}
 </div>;
}
