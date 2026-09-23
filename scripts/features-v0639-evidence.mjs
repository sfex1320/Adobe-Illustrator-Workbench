import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256,verifyHostEvidence} from './host-dependency-evidence.mjs';
export async function verifyFeaturesV0639(root){
 const bytes=f=>readFile(path.resolve(root,f));
 const json=async f=>JSON.parse((await bytes(f)).toString('utf8').replace(/^\uFEFF/,''));
 const passed=(r,n)=>{if(r.passed!==true||!Array.isArray(r.checks)||r.checks.length<n||r.checks.some(c=>c.passed!==true))throw Error('0.6.39 feature evidence incomplete.');};
 for(const [feature,suite,file,count] of [
  ['style-transfer','scripts/test-style-transfer-v0639.mjs','docs/review/style-v0639-native.json',8],
  ['bleed-write','scripts/test-bleed-v0639.mjs','docs/review/bleed-v0639-native.json',9]]){
  const r=await json(file);passed(r,count);
  if(r.testSha256!==sha256(await bytes(suite)))throw Error('Feature native suite changed: '+feature);
  await verifyHostEvidence(root,r.sourceSha256,feature);
  if(r.nativeSha256&&r.nativeSha256!==sha256(await bytes('artifacts/native/AIQNative.aip')))throw Error('Bleed native binary evidence stale.');
 }
 const vector=await json('docs/review/vector-scope-files-v0639.json');passed(vector,15);
 if(vector.testSha256!==sha256(await bytes('scripts/verify-vector-scope-v0639.py'))||vector.nativeReportSha256!==sha256(await bytes(vector.nativeReport)))throw Error('Vector file checks stale.');
 const native=await json(vector.nativeReport);passed(native,17);await verifyHostEvidence(root,native.sourceSha256,'direct-export');
 for(const [file,hash] of Object.entries(vector.sourceFiles))if(sha256(await bytes(file))!==hash)throw Error('Vector output changed after inspection.');
 const ui=await json('docs/review/ui-features-v0639/report.json');passed(ui,78);
 for(const [file,hash] of Object.entries(ui.sourceHashes))if(sha256(await bytes(file))!==hash)throw Error('Feature UI evidence stale: '+file);
 const update=await json('docs/review/update-helper-v0639.json');passed(update,6);
 if(update.sourceSha256!==sha256(await bytes('installer/Update.ps1'))||update.testSha256!==sha256(await bytes('scripts/test-update-helper-v0639.ps1')))throw Error('Update helper evidence stale.');
}
