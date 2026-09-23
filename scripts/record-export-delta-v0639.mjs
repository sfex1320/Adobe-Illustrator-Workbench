import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {sha256} from './host-dependency-evidence.mjs';
import {deltaFiles,verifyExportDelta} from './export-delta-evidence-v0639.mjs';
const root=process.cwd(),audit=JSON.parse(await readFile('scripts/evidence-baselines/export-changes-v0639.json','utf8'));
execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/raster-runtime-v0639.spec.ts','--reporter=json','--outputFile=docs/review/v0639-delta-unit.json'],{cwd:root,stdio:'inherit',windowsHide:true});
const files={};
for(const file of [...Object.keys(deltaFiles),'tests/raster-runtime-v0639.spec.ts','scripts/review-features-v0639.mjs','docs/review/ui-features-v0639/report.json','docs/review/v0639-delta-unit.json','scripts/export-delta-evidence-v0639.mjs','scripts/record-export-delta-v0639.mjs'])files[file]=sha256(await readFile(file));
const proof={kind:'focused-offline-export-delta',passed:true,auditSha256:sha256(JSON.stringify(audit)),files};
await writeFile('docs/review/export-delta-v0639.json',JSON.stringify(proof,null,2));
try{for(const file of Object.keys(deltaFiles))await verifyExportDelta(root,file,audit.files[file].before);console.log('Focused export delta accepted; original native reports remain unchanged.');}catch(error){proof.passed=false;proof.error=error.message;await writeFile('docs/review/export-delta-v0639.json',JSON.stringify(proof,null,2));throw error;}
