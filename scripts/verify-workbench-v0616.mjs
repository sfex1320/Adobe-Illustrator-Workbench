import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {sha256} from './direct-export-evidence.mjs';
const nativeRaw=await readFile('docs/review/v0616-native.json','utf8');
const report=JSON.parse(nativeRaw);
const checks=[],renders=[];
function check(name,passed,detail){checks.push({name,passed:!!passed,detail});}
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
try{
 for(const o of report.outputs.filter(o=>o.format==='svg')){
 const page=await browser.newPage();await page.setViewport({width:800,height:600,deviceScaleFactor:4});await page.goto(pathToFileURL(o.file).href);
 const info=await page.evaluate(()=>{const s=document.querySelector('svg');if(!s)throw Error('Missing SVG');const r=s.getBoundingClientRect();return {width:s.getAttribute('width'),height:s.getAttribute('height'),viewBox:s.getAttribute('viewBox'),texts:s.querySelectorAll('text').length,paths:s.querySelectorAll('path').length,pixels:[r.width,r.height],hidden:s.querySelectorAll('[style*="display:none"]').length,links:[...s.querySelectorAll('image')].map(n=>n.getAttribute('href')||n.getAttribute('xlink:href')||'')};});
 check(o.file+' physical size',info.width===o.physicalSize[0]+'pt'&&info.height===o.physicalSize[1]+'pt',info);
 check(o.file+' text export mode',o.outlineText?info.texts===0&&info.paths>0:info.texts>0,info);
 check(o.file+' viewport scale',info.pixels.every((v,i)=>Math.abs(v-o.physicalSize[i]*96/72)<0.05),info.pixels);
 check(o.file+' no external images',info.links.every(v=>v.startsWith('data:')),info.links);
 const file=o.file+'.render.png';await (await page.$('svg')).screenshot({path:file,omitBackground:true});renders.push({...o,render:file});await page.close();
 }
}finally{await browser.close();}
const passed=report.passed&&checks.every(c=>c.passed);await writeFile('docs/review/v0616-svg-files.json',JSON.stringify({passed,nativeReportSha256:sha256(nativeRaw),checks,renders},null,2));console.log(JSON.stringify({passed,checks:checks.length,failures:checks.filter(c=>!c.passed)},null,2));if(!passed)process.exitCode=1;
