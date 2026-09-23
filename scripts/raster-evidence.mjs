import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './direct-export-evidence.mjs';
import {verifyHostEvidence} from './host-dependency-evidence.mjs';
import {verifyRendererDependency} from './renderer-startup-evidence.mjs';
import {verifyWorkspaceExportEvidence} from './workspace-export-evidence.mjs';
import {verifyExportDelta} from './export-delta-evidence-v0639.mjs';
export async function verifyRasterEvidence(root){
 const build=JSON.parse((await readFile(path.join(root,'artifacts/raster/build.json'),'utf8')).replace(/^\uFEFF/,''));
 if(build.protocol!==1||build.files?.length!==7)throw Error('Independent renderer build manifest incomplete.');
 for(const f of build.files)if(sha256(await readFile(path.join(root,f.path)))!==f.sha256)throw Error('Renderer build is stale: '+f.path);
 for(const [name,min] of [['independent-raster.json',78],['independent-raster-host.json',24]]){
  const r=JSON.parse(await readFile(path.join(root,'docs/review',name),'utf8'));
  if(r.passed!==true||r.checks?.length<min||r.checks.some(c=>c.passed!==true)||!r.files)throw Error('Renderer acceptance incomplete: '+name);
  for(const [p,h] of Object.entries(r.files)){if(['host/raster/worker.py','artifacts/raster/AIQRaster.exe'].includes(p))await verifyRendererDependency(root,p,h);else if(p==='packages/core/src/workspace.ts')await verifyWorkspaceExportEvidence(root,h);else if(p==='packages/host-adapter/src/raster.ts'&&sha256(await readFile(path.join(root,p)))!==h)await verifyExportDelta(root,p,h);else if(sha256(await readFile(path.join(root,p)))!==h)throw Error('Renderer acceptance stale: '+p);}
  if(r.hostSha256)await verifyHostEvidence(root,r.hostSha256,'raster-host');
 }
 const runtime=JSON.parse(await readFile(path.join(root,'host/raster/runtime-dependencies.json'),'utf8'));
 for(const f of runtime.files)if(sha256(await readFile(path.join(process.env.LOCALAPPDATA,'AIQ-Engines',f.path)))!==f.sha256)throw Error('Local renderer dependency changed: '+f.path);
}
