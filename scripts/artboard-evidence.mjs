import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './direct-export-evidence.mjs';
import {verifyHostEvidence} from './host-dependency-evidence.mjs';
export async function verifyArtboardEvidence(root){
 const report=JSON.parse(await readFile(path.join(root,'docs/review/v0628-artboard-selection-native.json'),'utf8'));
 if(report.passed!==true||report.plugin!=='AIQNative'||report.checks?.length<5||report.checks.some(c=>c.passed!==true))throw Error('Native artboard selection acceptance incomplete.');
 await verifyHostEvidence(root,report.hostSha256,'artboard-selection');
 for(const [file,hash] of [['scripts/test-artboard-selection-v0628.mjs',report.testSuiteSha256],['artifacts/native/AIQNative.aip',report.nativeBinarySha256]])if(sha256(await readFile(path.join(root,file)))!==hash)throw Error('Artboard implementation changed; repeat native UI selection and state/history acceptance.');
 const regions=JSON.parse(await readFile(path.join(root,'docs/review/v0628-board-regions-native.json'),'utf8'));
 if(regions.passed!==true||regions.checks?.length<6||regions.checks.some(c=>c.passed!==true))throw Error('Artboard ownership validation missing or stale.');
 await verifyHostEvidence(root,regions.sourceSha256,'artboard-regions');
 for(const [file,hash] of [['packages/core/src/smart-group.ts',regions.coreSha256],['scripts/test-board-regions-v0628.mjs',regions.testSuiteSha256]])if(sha256(await readFile(path.join(root,file)))!==hash)throw Error('Artboard geometry evidence changed; repeat ownership acceptance.');
}
