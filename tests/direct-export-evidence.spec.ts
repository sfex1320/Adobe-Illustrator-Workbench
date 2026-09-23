import {describe,it,expect} from 'vitest';
// @ts-expect-error Native release utility is plain Node JavaScript, outside the panel bundle.
import {checkDirectExportEvidence,sha256} from '../scripts/direct-export-evidence.mjs';
function fixture(){
 const host='host-v1',suiteHash='test-suite-v1';
 const nativeRaw=JSON.stringify({passed:true,checks:[{passed:true}],sourceSha256:sha256(host),testSuiteSha256:suiteHash});
 const svgRaw=JSON.stringify({passed:true,checks:[{passed:true}],nativeReportSha256:sha256(nativeRaw)});
 const filesRaw=JSON.stringify({passed:true,checks:[{passed:true}],nativeReportSha256:sha256(nativeRaw),svgReportSha256:sha256(svgRaw)});
 return {host,suiteHash,nativeRaw,svgRaw,filesRaw};
}
describe('Direct export packaging evidence',()=>{
 it('accepts a matching native run and independently decoded files',()=>expect(checkDirectExportEvidence(fixture())).toBe(true));
 it('rejects a changed host even if every old test passed',()=>expect(()=>checkDirectExportEvidence({...fixture(),host:'host-v2'})).toThrow(/source/));
 it('rejects a changed validation suite',()=>expect(()=>checkDirectExportEvidence({...fixture(),suiteHash:'test-suite-v2'})).toThrow(/validation/));
 it('rejects results from an earlier native run',()=>{const f=fixture();f.nativeRaw=f.nativeRaw.replace('"passed":true','"passed":true,"run":2');expect(()=>checkDirectExportEvidence(f)).toThrow(/latest/);});
 it('rejects a failed file check',()=>{const f=fixture();f.filesRaw=f.filesRaw.replace('"passed":true','"passed":false');expect(()=>checkDirectExportEvidence(f)).toThrow(/failed/);});
 it('rejects an empty success report',()=>{const f=fixture();f.svgRaw=JSON.stringify({passed:true,checks:[]});expect(()=>checkDirectExportEvidence(f)).toThrow(/incomplete/);});
});
