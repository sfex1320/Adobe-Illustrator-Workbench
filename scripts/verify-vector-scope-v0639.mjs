import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
const directory=path.resolve(process.argv[2]);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
const renders=[];
try{for(const target of ['artboards','objects']){
 const file=path.join(directory,`collection-${target}-svg.svg`),page=await browser.newPage();
 await page.goto(pathToFileURL(file).href);
 await page.evaluate(()=>{const s=document.querySelector('svg'),box=s.viewBox.baseVal;s.style.width=box.width+'px';s.style.height=box.height+'px';});
 const output=file+'.render.png';await (await page.$('svg')).screenshot({path:output,omitBackground:true});
 renders.push({file,output,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')});await page.close();
}}finally{await browser.close();}
await fs.writeFile(path.join(directory,'svg-renders.json'),JSON.stringify(renders,null,2));
