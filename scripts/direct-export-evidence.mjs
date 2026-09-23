import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {assertHostEvidence,hostEvidenceContext} from './host-dependency-evidence.mjs';

export const directExportTestFiles=['scripts/test-workbench-v0616.mjs','scripts/verify-workbench-v0616.mjs','scripts/verify-workbench-v0616.py'];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export async function directExportSuiteHash(root){
 const parts=[];
 for(const name of directExportTestFiles)parts.push(name+':'+sha256(await readFile(path.join(root,name))));
 return sha256(parts.join('\n'));
}
export function checkDirectExportEvidence({host,suiteHash,nativeRaw,svgRaw,filesRaw,baselineHost,sharedProof}){
 const native=JSON.parse(nativeRaw),svg=JSON.parse(svgRaw),files=JSON.parse(filesRaw);
 for(const report of [native,svg,files]){
  if(report.passed!==true||!report.checks?.length||report.checks.some(c=>c.passed!==true))throw Error('Direct export acceptance failed or incomplete.');
 }
 if(native.testSuiteSha256!==suiteHash)throw Error('Host export source or validation scripts changed; rerun npm run test:export:native before packaging.');
 assertHostEvidence({host,baselineHost,sharedProof,expectedHash:native.sourceSha256,feature:'direct-export'});
 if(svg.nativeReportSha256!==sha256(nativeRaw)||files.nativeReportSha256!==sha256(nativeRaw)||files.svgReportSha256!==sha256(svgRaw))throw Error('Export file checks do not match the latest native run; rerun npm run test:export:native.');
 return true;
}
export async function verifyDirectExportEvidence(root){
 const [host,suiteHash,nativeRaw,svgRaw,filesRaw]=await Promise.all([
  readFile(path.join(root,'host/cep/com.aiq.workbench/hostscript.jsx')),directExportSuiteHash(root),
  readFile(path.join(root,'docs/review/v0616-native.json'),'utf8'),readFile(path.join(root,'docs/review/v0616-svg-files.json'),'utf8'),readFile(path.join(root,'docs/review/v0616-files.json'),'utf8')
 ]);
 return checkDirectExportEvidence({host,suiteHash,nativeRaw,svgRaw,filesRaw,...await hostEvidenceContext(root,JSON.parse(nativeRaw).sourceSha256)});
}
