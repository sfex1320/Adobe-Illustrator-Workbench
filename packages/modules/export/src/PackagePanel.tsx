import {usePreference} from '@aiq/ui';
import { ScaleField, scalePercent } from './ScaleField.js';
import { useState } from 'react';
import type { Workspace } from '@aiq/core';
import type { EditorAction, ExportProgress, EditorResult } from '@aiq/contracts';
import { PresetInput, Button, Card, Field, useEditor, EditorFeedback } from '@aiq/ui';
import { ExportJobStatus } from './ExportJobStatus.js';

type PackageAction=Extract<EditorAction,{type:'package'}>;
export function PackagePanel({workspace}:{workspace:Workspace}) {
 const e=useEditor(workspace,'document',{autoRefresh:true});
 const [folder,setFolder]=usePreference(workspace,'package.folder',workspace.getSettings().exportFolder??''),[name,setName]=usePreference(workspace,'package.name','');
 const [pdfCompatible,setPdfCompatible]=usePreference(workspace,'package.pdfCompatible',true);
 const [outline,setOutline]=usePreference(workspace,'package.outline',true),[formats,setFormats]=usePreference<PackageAction['formats']>(workspace,'package.formats',['pdf']);
 const [splitPDF,setSplitPDF]=usePreference(workspace,'package.splitPDF',false),[nested,setNested]=usePreference(workspace,'package.nested',true),[child,setChild]=usePreference(workspace,'package.child','画板输出');
 const [report,setReport]=usePreference<'md'|'txt'|'none'>(workspace,'package.report','md'),[dpi,setDpi]=usePreference(workspace,'package.dpi','300'),[scale,setScale]=usePreference(workspace,'package.scale','1');
 const [mode,setMode]=usePreference<PackageAction['colorMode']>(workspace,'package.mode','source'),[error,setError]=useState('');
 const [job,setJob]=useState(''),[progress,setProgress]=useState<ExportProgress|null>(null);
 const [result,setResult]=useState<EditorResult|null>(null);
 const submit=()=>{
  setError('');setResult(null);const resolution=Number(dpi);let percent:number;try{percent=scalePercent(scale);}catch(err){setError((err as Error).message);return;}
  if(!dpi.trim()||!Number.isFinite(resolution)||resolution<1||resolution>2400){setError('分辨率须为 1–2400 ppi');return;}
  const jobId=workspace.supportsExportProgress?.()?('package-'+Date.now().toString(36)):undefined;setJob(jobId??'');setProgress(null);
  void e.act({type:'package',pdfCompatible,folder:folder.trim(),name:name.trim()||((e.state?.docName??'文档').replace(/\.[^.]*$/,'')+'-打包'),outline,formats,splitPDF,outputSubfolder:nested?child.trim():'',report:report==='none'?null:report,resolution,scale:percent,colorMode:mode,jobId}).then(r=>{if(r)setResult(r);if(r?.exportProgress)setProgress(r.exportProgress);if(r?.files?.length)workspace.updateSettings({exportFolder:folder.trim()});});
 };
 return <div className="wb-export-panel"><div className="wb-export-scroll">
  <Card title="打包" icon="doc" help="一键收集完整可编辑 AI、链接和本机可定位字体，并生成所选附件。每次建立新打包目录；缺失项会列明。">
   <Field label="打包父目录"><div className="wb-dir-row"><input className="aiq-input" aria-label="打包父目录" value={folder} onChange={v=>setFolder(v.target.value)}/><Button disabled={e.busy} onClick={()=>void e.act({type:'choose-folder'}).then(r=>{if(r?.folder)setFolder(r.folder);})}>浏览</Button></div></Field>
   <Field label="打包目录名"><input className="aiq-input" aria-label="打包目录名" value={name} placeholder="文档名-打包" onChange={v=>setName(v.target.value)}/></Field>
   <label className="wb-check" title="关闭通常能加快打包，AI 仍可编辑；需要其他软件读取或置入 AI 时开启。此项不影响 PDF 附件。"><input type="checkbox" aria-label="打包 AI 兼容 PDF" checked={pdfCompatible} onChange={v=>setPdfCompatible(v.target.checked)}/>AI 兼容 PDF</label>
   
   <label className="wb-check" title="AI 原稿及转曲副本保持原尺寸、原颜色模式。倍率、分辨率和颜色模式设置仅用于画板附件。"><input type="checkbox" checked={outline} onChange={v=>setOutline(v.target.checked)}/>同时保存可见文字转曲 AI</label>
   
   <div className="wb-scope-options">{(['jpeg','png','pdf'] as const).map(f=><label key={f} title={f==='png'?'PNG 按画板输出，使用 RGB。':f==='jpeg'?'JPG 按画板输出。':'PDF 默认生成画板合集，也可勾选按画板拆分。'}><input type="checkbox" checked={formats.includes(f)} onChange={v=>setFormats(v.target.checked?[...formats,f]:formats.filter(x=>x!==f))}/>{f==='jpeg'?'JPG':f.toUpperCase()}</label>)}</div>
   {formats.includes('pdf')&&<label className="wb-check"><input type="checkbox" checked={splitPDF} onChange={v=>setSplitPDF(v.target.checked)}/>PDF 按画板拆分（不勾选生成合集）</label>}
   <label className="wb-check"><input type="checkbox" checked={nested} onChange={v=>setNested(v.target.checked)}/>画板附件保存到子文件夹</label>
   {nested&&<Field label="附件子目录"><input className="aiq-input" aria-label="附件子目录" value={child} onChange={v=>setChild(v.target.value)}/></Field>}
   <ScaleField value={scale} onChange={setScale} label="打包缩放" help="仅缩放画板附件；AI 原稿及转曲副本保持原尺寸、原颜色模式。"/>
   
   <Field label="附件分辨率 ppi"><PresetInput label="打包分辨率" inputMode="decimal" value={dpi} onChange={setDpi} presets={[50,72,100,150,200,300,400,600]} disabled={e.busy}/></Field>
   <Field label="附件颜色模式"><select className="aiq-select" aria-label="附件颜色模式" value={mode} onChange={v=>setMode(v.target.value as typeof mode)}><option value="source">跟随源文件</option><option value="rgb">RGB</option><option value="cmyk">CMYK</option></select></Field>
   <Field label="规范说明文档" help="说明包含画板数量、名称、原始及成品尺寸、字体家族与款式、使用色与色板库存、输出设置和缺失项。字体与复杂外观内的资源无法完整解析时会标明；大稿颜色统计超过 15 秒时保留已查内容，并列出未完成项。"><select className="aiq-select" aria-label="规范说明文档" value={report} onChange={v=>setReport(v.target.value as typeof report)}><option value="md">Markdown (.md)</option><option value="txt">纯文本 (.txt)</option><option value="none">不生成</option></select></Field>
   
  </Card>{!!result?.skipped.length&&<Card title="未完成项" icon="doc"><ul>{result.skipped.slice(0,100).map((item,i)=><li key={i}>{item.reason}</li>)}</ul>{result.skipped.length>100&&<p>其余项目请查看规范说明文档。</p>}</Card>}</div><div className="wb-export-actions"><Button variant="primary" disabled={e.busy||!e.state||!folder.trim()||(nested&&!child.trim())} onClick={submit}>📦 一键打包</Button>{result?.folder&&!!result.files?.length&&<Button disabled={e.busy} onClick={()=>void e.act({type:'open-folder',folder:result.folder!})}>打开打包目录</Button>}<ExportJobStatus workspace={workspace} jobId={job} running={e.busy} result={progress}/><EditorFeedback message={e.message} error={error||e.error}/></div></div>;
}
