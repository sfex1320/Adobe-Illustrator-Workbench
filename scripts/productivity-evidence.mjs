import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {verifyHostEvidence,findHostBaseline,hostPath} from './host-dependency-evidence.mjs';
import {productivityUiBehavior} from './productivity-ui-evidence.mjs';
const uiPath='packages/modules/productivity/src/ProductivityPanel.tsx';

export const productivityStages=['numbering','baseline','mask','copy','overflow','merge','barcodes','photoshop'];
export const productivityEvidenceFiles=[
 'host/cep/com.aiq.workbench/hostscript.jsx',
 'scripts/test-productivity-v0632.mjs','scripts/test-ps-return-v0632.ps1','scripts/verify-productivity-barcodes-v0632.py',
 'packages/contracts/src/productivity.ts','packages/core/src/number-sequence.ts',
 'packages/modules/productivity/src/ProductivityPanel.tsx',
 'packages/modules/productivity/src/length-options.ts','packages/modules/productivity/src/barcode.ts',
 'packages/modules/productivity/src/index.ts','packages/modules/productivity/package.json'
];
export async function productivitySourceHash(root,baselineHost,baselineUi){
 const values=await Promise.all(productivityEvidenceFiles.map(async file=>file+':'+createHash('sha256').update(file===hostPath&&baselineHost?baselineHost:file===uiPath&&baselineUi?baselineUi:await readFile(path.join(root,file))).digest('hex')));
 return createHash('sha256').update(values.join('\n')).digest('hex');
}
export function checkProductivityEvidence(report,hash){
 if(report.passed!==true||!report.checks?.length||report.checks.some(c=>c.passed!==true)||!productivityStages.every(s=>report.stages?.includes(s)))throw Error('生产辅助原生验收失败或不完整；不能发布未验证的功能。');
 if(report.sourceHash!==hash)throw Error('生产辅助源码或测试已改变，请重跑完整 scripts/test-productivity-v0632.mjs。');
 return true;
}
export async function verifyProductivityEvidence(root){
 const report=JSON.parse(await readFile(path.join(root,'docs/review/v0632-productivity-native.json'),'utf8'));
 const current=await productivitySourceHash(root);if(report.sourceHash===current)return checkProductivityEvidence(report,current);
 await verifyHostEvidence(root,report.hostSha256,'productivity');
 const baseline=await findHostBaseline(root,report.hostSha256);
 const oldHostHash=await productivitySourceHash(root,baseline.data);
 if(report.sourceHash===oldHostHash)return checkProductivityEvidence(report,oldHostHash);
 // Authenticate the exact archived UI together with every other legacy input
 // before comparing the presentation-only AST. No report hashes are rewritten.
 const baselineUi=await readFile(path.join(root,'scripts/evidence-baselines/ProductivityPanel-v0635.tsx'));
 checkProductivityEvidence(report,await productivitySourceHash(root,baseline.data,baselineUi));
 if(productivityUiBehavior(baselineUi)!==productivityUiBehavior(await readFile(path.join(root,uiPath))))throw Error('生产辅助控件行为或命令已改变，需要对应功能的新实机证据。');
 return true;
}
