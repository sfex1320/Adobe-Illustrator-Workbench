import{readFile,writeFile,copyFile,unlink}from'node:fs/promises';import{randomBytes,createHash}from'node:crypto';import{tmpdir}from'node:os';import{connect}from'./production-stress-bridge.mjs';
const{host,close}=connect(),checks=[],outputs=[];
const hash=v=>createHash('sha256').update(v).digest('hex');
const nativeBinarySha256=hash(await readFile('artifacts/native/AIQNative.aip')),testSuiteSha256=hash((await readFile('scripts/test-rgb-codec-v0620.mjs','utf8'))+'\n'+(await readFile('scripts/verify-rgb-codec-v0620.py','utf8')));
try{for(const scenario of ['q0','q20','q73','q80','q100','invalid','overwrite']){
 const nonce=randomBytes(16).toString('hex'),base=tmpdir()+'/AIQJPEG-'+nonce,reply=tmpdir()+'/AIQNative-'+nonce+'.json';
 try{
 await copyFile('artifacts/v0620-codec/'+(scenario==='invalid'?'bad.png':'profile.png'),base+'.png');
 if(scenario==='overwrite')await writeFile(base+'.jpg','SENTINEL');
 await host(`app.sendScriptMessage('AIQNative','jpeg-file:${nonce}:${scenario.startsWith('q')?scenario.slice(1):80}','');'done';`);
 const result=JSON.parse(await readFile(reply,'utf8'));let passed;
 if(scenario.startsWith('q')){passed=result.ok===true;await copyFile(base+'.jpg','artifacts/v0620-codec/'+scenario+'.jpg');outputs.push({quality:Number(scenario.slice(1)),file:'artifacts/v0620-codec/'+scenario+'.jpg'});}
 else {passed=result.ok===false;if(scenario==='overwrite')passed=passed&&await readFile(base+'.jpg','utf8')==='SENTINEL';}
 checks.push({scenario,passed,result});
 }finally{for(const f of [base+'.png',base+'.jpg',reply])await unlink(f).catch(()=>{});}
}}finally{close();const passed=checks.length===7&&checks.every(c=>c.passed);await writeFile('docs/review/v0620-codec-contract.json',JSON.stringify({passed,nativeBinarySha256,testSuiteSha256,checks,outputs},null,2));console.log(JSON.stringify({passed,checks}));if(!passed)process.exitCode=1;}
