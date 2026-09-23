import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export function connect(){
 const server=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/editor-test-bridge.ps1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pending;
 createInterface({input:server.stdout}).on('line',line=>{if(pending){const p=pending;pending=null;p.resolve(Buffer.from(line,'base64').toString('utf8'));}});
 server.on('exit',()=>{pending?.reject(Error('COM bridge exited'));pending=null;});
 server.stderr.on('data',data=>process.stderr.write(data));
 return {host:code=>new Promise((resolve,reject)=>{if(pending)return reject(Error('Concurrent host call refused'));pending={resolve,reject};server.stdin.write(encodeURIComponent(code)+'\n');}),close:()=>server.stdin.end()};
}
