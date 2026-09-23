import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-expect-error Node-only evidence utility.
import {workspaceExportFingerprint,verifyWorkspaceExportEvidence} from '../scripts/workspace-export-evidence.mjs';
// @ts-expect-error Node-only evidence utility.
import {validateRendererStartup,rendererStartupFiles,rendererStartupJobs} from '../scripts/renderer-startup-evidence.mjs';
it('keeps export workspace behavior identical while separately binding variable capture changes',async()=>{
 const report=JSON.parse(readFileSync('docs/review/independent-raster-host.json','utf8'));
 await expect(verifyWorkspaceExportEvidence(process.cwd(),report.files['packages/core/src/workspace.ts'])).resolves.toBeUndefined();
 const source=readFileSync('packages/core/src/workspace.ts','utf8'),before=workspaceExportFingerprint(source);
 expect(workspaceExportFingerprint(source.replace("operation==='capture'","operation==='unknown'"))).toBe(before);
 expect(workspaceExportFingerprint(source.replace('const measured=await fn.call(this.options.adapter,request);','const measured=await fn.call(this.options.adapter,{...request,action:{type:"wrong"}});'))).not.toBe(before);
 expect(workspaceExportFingerprint(source.replace("if(action.type==='variable-data'&&action.operation==='capture'", "if(sideEffect()&&action.type==='variable-data'&&action.operation==='capture'"))).not.toBe(before);
 await expect(verifyWorkspaceExportEvidence(process.cwd(),'wrong-baseline')).rejects.toThrow('dependencies');
});
it('requires actual matching CEP process observations and every requested startup case',()=>{
 const files=Object.fromEntries(rendererStartupFiles.map((f:string)=>[f,'hash:'+f]));
 const observations=rendererStartupJobs.map((id:string,i:number)=>({id:'obs-'+id,jobId:'job-'+id,workerPID:i+100,parentPID:50,exeHash:files['artifacts/raster/AIQRaster.exe'],parentProcessName:'CEPHtmlEngine.exe'}));
 const jobs:Array<{id:string;observationId:string;jobId:string;workerPID:number;parentPID:number;workerSha256:string;parentProcessName:string;passed:boolean}>=observations.map((o:{id:string;jobId:string;workerPID:number;parentPID:number;exeHash:string;parentProcessName:string},i:number)=>({id:rendererStartupJobs[i],observationId:o.id,jobId:o.jobId,workerPID:o.workerPID,parentPID:o.parentPID,workerSha256:o.exeHash,parentProcessName:o.parentProcessName,passed:true}));
 const report={kind:'real-cep-renderer-startup',passed:true,files,checks:[{passed:true}],jobs};
 expect(validateRendererStartup(report,files,observations)).toBe(true);
 for(const altered of [{...report,passed:false},{...report,jobs:jobs.slice(1)},{...report,checks:[{passed:false}]},{...report,files:{}},{...report,jobs:jobs.map(j=>({...j,workerSha256:'other'}))},{...report,jobs:jobs.map(j=>({...j,parentProcessName:'powershell.exe'}))}])expect(()=>validateRendererStartup(altered,files,observations)).toThrow();
 expect(()=>validateRendererStartup(report,files,[])).toThrow('observed CEP worker');
 expect(()=>validateRendererStartup(report,files,[...observations,observations[0]])).toThrow('observed CEP worker');
});
