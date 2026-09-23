import {cepUserFiles} from './user-files.js';
type ProcessPort={createProcess(...args:string[]):{err:number;data:number};onquit(pid:number,callback:()=>void):{err:number};isRunning(pid:number):{err:number;data:boolean}};
export interface UpdateResult {ok:boolean;status:string;available?:boolean;version?:string;currentVersion?:string;notes?:string;message?:string}
let pending:Promise<UpdateResult>|null=null;
/** Explicit external update process. It never calls the Illustrator host channel. */
export function runWorkbenchUpdate(operation:'check'|'install',channel:'github'|'mirror',mirror:string):Promise<UpdateResult>{
 if(pending)return pending;
 const env=globalThis as {cep?:{process?:ProcessPort};__adobe_cep__?:{getSystemPath?(kind:string):string}};
 const port=env.cep?.process,disk=cepUserFiles(),extension=env.__adobe_cep__?.getSystemPath?.('extension');
 if(!port||!disk||!extension)return Promise.reject(Error('自更新需要在 Windows Illustrator 工作台中运行'));
 if(channel==='mirror'){try{const url=new URL(mirror);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();}catch{return Promise.reject(Error('请填写有效的 HTTPS 镜像前缀'));}}
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const name='update-'+nonce+'.json',resultName='update-result-'+nonce+'.json';
 disk.write(name,JSON.stringify({operation,channel,mirror}));
 const root=decodeURI(extension).replace(/^file:\/\//,'').replace(/^\/([A-Za-z]:)/,'$1').replace(/[\\/]$/,'');
 pending=new Promise<UpdateResult>((resolve,reject)=>{
  let done=false;
  const finish=()=>{if(done)return;done=true;try{const raw=disk.read(resultName);if(!raw)throw Error('更新程序未返回结果，请检查安装状态');const result=JSON.parse(raw.replace(/^\uFEFF/,'')) as UpdateResult;disk.remove(resultName);if(!result.ok)throw Error(result.message||'更新失败');resolve(result);}catch(error){reject(error);}};
  const started=port.createProcess('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',root+'/bin/update/Update.ps1','-Nonce',nonce);
  if(started.err||started.data<=0){disk.remove(name);reject(Error('无法启动更新组件'));return;}
  const registered=port.onquit(started.data,finish);if(registered.err&&!port.isRunning(started.data).data)finish();else if(registered.err)reject(Error('无法接收更新进程结果，请勿重复提交'));else if(!port.isRunning(started.data).data)finish();
 }).finally(()=>{pending=null;});
 return pending;
}
