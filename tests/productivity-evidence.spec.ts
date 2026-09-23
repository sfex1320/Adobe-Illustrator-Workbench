import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
// @ts-expect-error Node-only evidence utility.
import {productivityUiBehavior} from '../scripts/productivity-ui-evidence.mjs';
// @ts-expect-error Release utility runs in Node, outside panel TypeScript.
import {checkProductivityEvidence,productivityStages} from '../scripts/productivity-evidence.mjs';
it('blocks release after failures, partial stage runs or changed implementation',()=>{
 const report={passed:true,stages:productivityStages,sourceHash:'current',checks:[{passed:true}]};
 expect(checkProductivityEvidence(report,'current')).toBe(true);
 expect(()=>checkProductivityEvidence({...report,stages:['numbering']},'current')).toThrow('不完整');
 expect(()=>checkProductivityEvidence({...report,checks:[{passed:false}]},'current')).toThrow('失败');
 expect(()=>checkProductivityEvidence(report,'changed')).toThrow('改变');
 expect(()=>checkProductivityEvidence({...report,checks:[]},'current')).toThrow('不完整');
});
it('retains controls, command arguments and dynamic messages while ignoring audited tooltip presentation',()=>{
 const before=readFileSync('scripts/evidence-baselines/ProductivityPanel-v0635.tsx','utf8');
 const after=readFileSync('packages/modules/productivity/src/ProductivityPanel.tsx','utf8');
 expect(productivityUiBehavior(after)).toBe(productivityUiBehavior(before));
 for(const changed of [after.replace("operation:'sequence'","operation:'baseline'"),after.replace('disabled={e.busy}','disabled={false}'),after.replace('{r.detail}','{r.index}'),after.replace("help?:string","help:string"),after.replace("placeholder:options.placeholder","placeholder:'WRONG'")]){
  let fingerprint='refused';try{fingerprint=productivityUiBehavior(changed);}catch{/* Rejection also prevents native evidence reuse. */}
  expect(fingerprint).not.toBe(productivityUiBehavior(before));
 }
 expect(()=>productivityUiBehavior(after.replace('value={String(options[key])}','value={help}'))).toThrow('runtime');
});
