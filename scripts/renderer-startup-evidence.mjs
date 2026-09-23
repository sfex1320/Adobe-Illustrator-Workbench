import {readFile,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {sha256} from './host-dependency-evidence.mjs';
import {deltaFiles,verifyExportDelta} from './export-delta-evidence-v0639.mjs';
const run=promisify(execFile);
export const rendererStartupFiles=['host/raster/worker.py','artifacts/raster/AIQRaster.exe','scripts/build-raster.ps1','scripts/verify-raster-startup-v0636.py','packages/modules/export/src/raster-routing.ts','packages/modules/export/src/EditorExportPanel.tsx'];
export const rendererStartupJobs=['forced-small','forced-high-ppi','auto-large'];
export function validateRendererStartup(report,currentFiles,observations){
 if(report.kind!=='real-cep-renderer-startup'||report.passed!==true||!report.checks?.length||report.checks.some(c=>c.passed!==true)||!Array.isArray(report.jobs)||report.jobs.some(j=>j.passed!==true)||rendererStartupFiles.some(file=>report.files?.[file]!==currentFiles[file]))throw Error('Renderer startup evidence incomplete or stale.');
 const records=Array.isArray(observations)?observations:observations?.observations;
 if(!Array.isArray(records))throw Error('Renderer startup process observations missing.');
 for(const id of rendererStartupJobs){
  const jobs=report.jobs.filter(j=>j.id===id);if(jobs.length!==1)throw Error('Renderer startup case missing or duplicated: '+id);
  const j=jobs[0],matches=records.filter(r=>r.id===j.observationId&&r.jobId===j.jobId&&r.workerPID===j.workerPID&&r.parentPID===j.parentPID&&r.exeHash===j.workerSha256&&r.parentProcessName===j.parentProcessName);
  if(j.passed!==true||!j.jobId||!j.observationId||!Number.isInteger(j.workerPID)||j.workerPID<=0||!Number.isInteger(j.parentPID)||j.parentPID<=0||j.workerSha256!==currentFiles['artifacts/raster/AIQRaster.exe']||j.parentProcessName?.toLowerCase()!=='cephtmlengine.exe'||matches.length!==1)throw Error('Renderer startup job lacks matching observed CEP worker: '+id);
 }
 return true;
}
export async function verifyRendererStartup(root){
 const report=JSON.parse(await readFile(path.join(root,'docs/review/raster-startup-v0636.json'),'utf8')),currentFiles={};
 for(const file of new Set([...rendererStartupFiles,...Object.keys(report.files||{})])){currentFiles[file]=sha256(await readFile(path.resolve(root,file)));if(report.files?.[file]!==currentFiles[file]){if(deltaFiles[file])currentFiles[file]=sha256(await verifyExportDelta(root,file,report.files[file]));else throw Error('Renderer startup source changed: '+file);}}
 const observed=await readFile(path.resolve(root,report.observationsFile||'missing-observations'));
 if(sha256(observed)!==report.observationsSha256)throw Error('Renderer startup observation hash mismatch.');
 validateRendererStartup(report,currentFiles,JSON.parse(observed));
 for(const job of report.jobs){for(const kind of ['request','result','output']){if(!job[kind+'File']||sha256(await readFile(path.resolve(root,job[kind+'File'])))!==job[kind+'Sha256'])throw Error('Renderer startup '+kind+' evidence changed: '+job.id);}}
 return report;
}
export async function verifyRendererDependency(root,file,expectedHash){
 const current=await readFile(path.join(root,file));if(sha256(current)===expectedHash)return;
 if(!['host/raster/worker.py','artifacts/raster/AIQRaster.exe'].includes(file))throw Error('Unknown renderer evidence dependency: '+file);
 const oldReport=JSON.parse(await readFile(path.join(root,'docs/review/independent-raster.json'),'utf8'));
 if(!oldReport.passed||oldReport.checks?.length<78||!oldReport.checks||oldReport.checks.some(c=>!c.passed)||oldReport.files?.[file]!==expectedHash)throw Error('Renderer legacy source baseline mismatch.');
 const oldSource='scripts/evidence-baselines/worker-v0635.py';if(sha256(await readFile(path.join(root,oldSource)))!==oldReport.files['host/raster/worker.py'])throw Error('Renderer archived source hash mismatch.');
 let oldExe;
 for(const release of (await readdir(path.join(root,'releases'))).filter(n=>/^AIQ-Workbench-[\d.]+-Windows$/.test(n)).sort().reverse()){
  const candidate=path.join(root,'releases',release,'payload/com.aiq.workbench/bin/raster/AIQRaster.exe');try{if(sha256(await readFile(candidate))===oldReport.files['artifacts/raster/AIQRaster.exe']){oldExe=candidate;break;}}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 if(!oldExe)throw Error('Exact accepted renderer executable baseline missing.');
 const {stdout}=await run('python',[path.join(root,'scripts/renderer-dependency-evidence.py'),path.join(root,oldSource),path.join(root,'host/raster/worker.py'),oldExe,path.join(root,'artifacts/raster/AIQRaster.exe')],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:1024*1024});
 if(JSON.parse(stdout).passed!==true)throw Error('Renderer dependency comparison failed.');
 await verifyRendererStartup(root);
}
