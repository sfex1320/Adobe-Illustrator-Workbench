import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './direct-export-evidence.mjs';
import {verifyHostEvidence} from './host-dependency-evidence.mjs';
export async function verifyGlyphEvidence(root){
 const report=JSON.parse(await readFile(path.join(root,'docs/review/v0619-glyph-native.json'),'utf8'));
 if(report.passed!==true||report.plugin!=='AIQNative'||report.checks?.length<75||report.checks.some(c=>c.passed!==true))throw Error('Native glyph acceptance incomplete; run npm run test:glyph:native using the production native module.');
 await verifyHostEvidence(root,report.hostSha256,'glyph');
 const files=[['scripts/test-glyph-native-v0619.mjs',report.testSuiteSha256],['artifacts/native/AIQNative.aip',report.nativeBinarySha256]];
 for(const [file,hash] of files)if(sha256(await readFile(path.join(root,file)))!==hash)throw Error('Glyph implementation or validation changed; rerun npm run test:glyph:native.');
 return true;
}
