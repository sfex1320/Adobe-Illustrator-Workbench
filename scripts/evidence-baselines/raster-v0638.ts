import type {EditorResult, RasterJob} from '@aiq/contracts';
import {cepUserFiles} from './user-files.js';
import {validateRasterJob} from './export-job-store.js';
type Port={createProcess(...args:string[]):{err:number;data:number};onquit(pid:number,callback:()=>void):{err:number};isRunning(pid:number):{err:number;data:boolean}};
function runtime(){
 const e=globalThis as {cep?:{process?:Port;fs?:{stat(path:string):{err:number}}};__adobe_cep__?:{getSystemPath?(type:string):string}};
 const root=e.__adobe_cep__?.getSystemPath?.('extension');
 if(!root||!e.cep?.process||!cepUserFiles())throw Error('独立渲染需要完整安装的 CEP 插件');
 const exe=decodeURI(root).replace(/^file:\/\//,'').replace(/^\/([A-Za-z]:)/,'$1').replace(/[\\/]$/,'')+'/bin/raster/AIQRaster.exe';
 if(e.cep.fs?.stat(exe).err!==0)throw Error('独立渲染程序未安装，请完成新版安装');
 return {exe,port:e.cep.process,disk:cepUserFiles()!};
}
export function requireRasterRuntime():void{runtime();}
export async function finishRasterExport(job:RasterJob):Promise<EditorResult>{
 validateRasterJob(job,job.jobId);
 const {exe,port,disk}=runtime(),id=job.jobId;
 if(disk.read('raster-'+id+'.json')||disk.read('raster-result-'+id+'.json')||disk.read('raster-run-'+id+'.lock'))throw Error('独立渲染任务编号已使用');
 disk.write('raster-'+id+'.json',JSON.stringify(job));
 return new Promise<EditorResult>((resolve,reject)=>{
  let done=false;
  const finish=()=>{if(done)return;done=true;try{const raw=disk.read('raster-result-'+id+'.json');if(!raw)throw Error('独立渲染程序未返回结果，已保留任务记录；请勿重复启动');const r=JSON.parse(raw) as EditorResult;if(!['completed','partial','failed'].includes(r.status)||!Array.isArray(r.files)||!Array.isArray(r.skipped)||!Array.isArray(r.sideEffects)||r.exportProgress?.jobId!==id)throw Error('独立渲染结果无效');resolve(r);}catch(error){reject(error);}};
  const launch=port.createProcess(exe,id);if(launch.err||launch.data<=0){reject(Error('无法启动独立渲染程序，准备文件已保留'));return;}
  const registered=port.onquit(launch.data,finish);
  if(registered.err){if(!port.isRunning(launch.data).data)finish();else reject(Error('无法接收独立渲染进程结果；请勿重复启动本任务'));}
  else if(!port.isRunning(launch.data).data)finish();
 });
}
