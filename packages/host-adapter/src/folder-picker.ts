import {cepUserFiles} from './user-files.js';
type ProcessPort={createProcess(...args:string[]):{err:number;data:number};onquit(pid:number,callback:()=>void):{err:number};isRunning(pid:number):{err:number;data:boolean}};
let pending:Promise<string|null>|null=null;
/** Explicit dialog only. Separate process: no Illustrator scripting, saves or polling. */
export function chooseSystemFolder(initial=''):Promise<string|null>{
 if(pending)return pending;
 const env=globalThis as {cep?:{process?:ProcessPort};__adobe_cep__?:{getSystemPath?(kind:string):string}};
 const process=env.cep?.process,disk=cepUserFiles(),extension=env.__adobe_cep__?.getSystemPath?.('extension');
 if(!process||!disk||!extension)return Promise.reject(Error('当前环境不支持系统文件夹选择，请粘贴目录路径'));
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),name='folder-'+nonce+'.json';
 const exe=decodeURI(extension).replace(/^file:\/\//,'').replace(/^\/([A-Za-z]:)/,'$1').replace(/[\\/]$/,'')+'/bin/FolderPicker.exe';
 pending=new Promise<string|null>((resolve,reject)=>{
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;try{const raw=disk.read(name);if(!raw)throw Error('文件夹窗口未返回结果');const r=JSON.parse(raw);if(!r.ok||r.folder!==null&&typeof r.folder!=='string')throw Error('无法打开系统文件夹窗口');disk.remove(name);resolve(r.folder);}catch(error){try{disk.remove(name);}catch{/* preserve original error */}reject(error);}};
  const launch=process.createProcess(exe,nonce,initial);if(launch.err||launch.data<=0){reject(Error('文件夹组件未安装或无法启动'));return;}
  const registered=process.onquit(launch.data,finish);
  if(registered.err){if(!process.isRunning(launch.data).data)finish();else reject(Error('无法接收文件夹窗口结果'));}
  else if(!process.isRunning(launch.data).data)finish();
 }).finally(()=>{pending=null;});
 return pending;
}
