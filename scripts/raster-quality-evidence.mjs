import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './direct-export-evidence.mjs';
import {verifyHostEvidence,hostPath} from './host-dependency-evidence.mjs';
import {verifyRendererDependency} from './renderer-startup-evidence.mjs';
export async function verifyRasterQualityEvidence(root){
 for(const [name,min] of [['raster-edges.json',16],['raster-empty-forms.json',8],['v0632-layered-export-files.json',45]]){
  const report=JSON.parse(await readFile(path.join(root,'docs/review',name),'utf8'));
  if(!report.passed||report.checks?.length<min||report.checks.some(c=>!c.passed)||!report.files)throw Error('Raster quality evidence incomplete: '+name);
  for(const [file,hash] of Object.entries(report.files)){if(file===hostPath)await verifyHostEvidence(root,hash,'layered-export');else if(['host/raster/worker.py','artifacts/raster/AIQRaster.exe'].includes(file))await verifyRendererDependency(root,file,hash);else if(sha256(await readFile(path.join(root,file)))!==hash)throw Error('Raster quality evidence stale: '+file);}
  if(report.nativeReportSha256){
   const data=await readFile(path.join(root,'docs/review/v0632-layered-export.json'));
   const native=JSON.parse(data);
   if(sha256(data)!==report.nativeReportSha256||!native.passed)throw Error('Layered native verification stale');
   await verifyHostEvidence(root,native.hostSha256,'layered-export');
  }
 }
}
