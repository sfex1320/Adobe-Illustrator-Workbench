import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {verifyHostEvidence,hostPath} from './host-dependency-evidence.mjs';
import {verifyRendererDependency} from './renderer-startup-evidence.mjs';
import {verifyWorkspaceExportEvidence} from './workspace-export-evidence.mjs';
import {verifyExportDelta} from './export-delta-evidence-v0639.mjs';
export const lifecycleEvidenceFiles=[
 'host/cep/com.aiq.workbench/hostscript.jsx','host/raster/worker.py','artifacts/raster/AIQRaster.exe',
 'packages/contracts/src/export-job.ts','packages/host-adapter/src/export-job-controller.ts',
 'packages/host-adapter/src/export-job-store.ts','packages/host-adapter/src/cep.ts',
 'packages/host-adapter/src/raster.ts','packages/core/src/workspace.ts',
 'packages/modules/export/src/ExportJobStatus.tsx','scripts/test-export-lifecycle-native.mjs',
 'tests/export-job-lifecycle.spec.ts','tests/export-job-store.spec.ts','tests/export-job-status.spec.tsx',
];
export async function lifecycleHashes(root){
 return Object.fromEntries(await Promise.all(lifecycleEvidenceFiles.map(async file=>[file,createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')])));
}
export async function verifyExportLifecycleEvidence(root){
 const r=JSON.parse(await readFile(path.join(root,'docs/review/export-lifecycle-native-v0634.json'),'utf8'));
 if(r.passed!==true||r.kind!=='COM-and-compiled-worker'||r.checks?.length!==25||r.checks.some(c=>c.passed!==true))throw Error('导出生命周期实机验收未完成');
 for(const [file,hash] of Object.entries(await lifecycleHashes(root))){if(file===hostPath)await verifyHostEvidence(root,r.files?.[file],'export-lifecycle');else if(['host/raster/worker.py','artifacts/raster/AIQRaster.exe'].includes(file))await verifyRendererDependency(root,file,r.files?.[file]);else if(file==='packages/core/src/workspace.ts')await verifyWorkspaceExportEvidence(root,r.files?.[file]);else if(file==='packages/host-adapter/src/raster.ts'&&r.files?.[file]!==hash)await verifyExportDelta(root,file,r.files[file]);else if(r.files?.[file]!==hash)throw Error('导出生命周期验收已过期：'+file);}
}
