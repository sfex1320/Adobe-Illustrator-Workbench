import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function verifyRGBCodecEvidence(root){
 const read=f=>readFile(path.join(root,f)),hash=v=>createHash('sha256').update(v).digest('hex');
 const [nativeRaw,filesRaw,binary,script,verifier]=await Promise.all([read('docs/review/v0620-codec-contract.json'),read('docs/review/v0620-codec-files.json'),read('artifacts/native/AIQNative.aip'),read('scripts/test-rgb-codec-v0620.mjs'),read('scripts/verify-rgb-codec-v0620.py')]);
 const native=JSON.parse(nativeRaw),files=JSON.parse(filesRaw);
 if(native.passed!==true||native.checks?.length!==7||native.checks.some(c=>!c.passed)||files.passed!==true||files.checks?.length!==6||files.checks.some(c=>!c.passed)||native.nativeBinarySha256!==hash(binary)||native.testSuiteSha256!==hash(script.toString()+'\n'+verifier.toString())||files.nativeReportSha256!==hash(nativeRaw))throw Error('RGB JPEG codec evidence failed or stale; run npm run test:codec:native.');
}
