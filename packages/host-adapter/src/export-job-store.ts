import type {ExportProgress, PreparedExportReceipt, RasterJob} from '@aiq/contracts';
const numberIn=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function absolutePath(value:unknown):string {
  if(typeof value!=='string'||value.length>32000||Array.from(value).some(c=>c.charCodeAt(0)<32))throw Error('任务路径无效');
  const p=value.replace(/\\/g,'/');
  if(!/^(?:[A-Za-z]:\/|\/\/[^/]+\/[^/]+(?:\/|$))/.test(p)||p.split('/').some((v,i)=>v==='..'||v==='.'||/[. ]$/.test(v)||v.includes(':')&&!(i===0&&/^[A-Za-z]:$/.test(v))))throw Error('任务路径无效');
  return p.replace(/\/$/,'').toLowerCase();
}
/** Accept historical status files, but never pass malformed optional fields to React. */
export function parseExportProgress(raw:string,jobId:string):ExportProgress|null {
  try {
    if(raw.length>1500000)return null;
    const p=JSON.parse(raw.replace(/^\uFEFF/,'')) as ExportProgress;
    if(!p||p.jobId!==jobId||!['running','completed','partial','cancelled','failed'].includes(p.status)||!Number.isInteger(p.total)||!numberIn(p.total,0,10000))return null;
    if(![p.current,p.completed,p.failed].every(v=>Number.isInteger(v)&&numberIn(v,0,p.total))||p.completed+p.failed>p.total)return null;
    if(!Array.isArray(p.completedIndexes)||p.completedIndexes.length!==p.completed||new Set(p.completedIndexes).size!==p.completedIndexes.length||!p.completedIndexes.every(v=>Number.isInteger(v)&&numberIn(v,0,9999)))return null;
    if(p.prepared!==undefined&&(!Number.isInteger(p.prepared)||!numberIn(p.prepared,0,p.total)))return null;
    if(p.phase!==undefined&&!['preparing','snapshot','opening','pdf','prepared','rendering','encoding','validating','publishing','completed','partial','cancelled','failed','host-uncertain'].includes(p.phase))return null;
    if(p.message!==undefined&&(typeof p.message!=='string'||p.message.length>10000))return null;
    if([p.startedAt,p.updatedAt].some(v=>v!==undefined&&!numberIn(v,0,Number.MAX_SAFE_INTEGER)))return null;
    return p;
  }catch{return null;}
}
/** Also used before starting a worker, so malformed host output cannot become a process request. */
export function validateRasterJob(value:unknown,jobId:string):RasterJob {
  if(!value||typeof value!=='object')throw Error('独立渲染任务无效');
  const j=value as RasterJob;
  if(j.protocol!==1||j.jobId!==jobId||!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId)||!Array.isArray(j.pages)||j.pages.length<1||j.pages.length>1000)throw Error('任务协议或页数无效');
  if(!['jpeg','png','tif'].includes(j.format)||!['rgb','cmyk'].includes(j.color)||j.format==='png'&&j.color!=='rgb'||!numberIn(j.ppi,1,2400)||!numberIn(j.scale,.01,100)||!numberIn(j.quality,0,100))throw Error('任务输出参数无效');
  if(!['source','standard','custom'].includes(j.profile)||typeof j.iccPath!=='string'||typeof j.transparent!=='boolean'||typeof j.optimize!=='boolean'||j.smoothing!==undefined&&!['standard','high'].includes(j.smoothing)||j.spotPolicy!==undefined&&!['reject','preview'].includes(j.spotPolicy))throw Error('任务颜色或采样参数无效');
  const folder=absolutePath(j.folder),indexes=new Set<number>(),pdfs=new Set<string>(),outputs=new Set<string>();
  for(const p of j.pages){
    if(!p||!Number.isInteger(p.index)||p.index<0||p.index>9999||indexes.has(p.index)||typeof p.pdf!=='string'||!/^page-\d+\.pdf$/.test(p.pdf)||pdfs.has(p.pdf)||!Array.isArray(p.sizePt)||p.sizePt.length!==2||!p.sizePt.every(v=>numberIn(v,.001,16348)))throw Error('任务页面无效');
    const output=absolutePath(p.output);
    if(output.slice(0,output.lastIndexOf('/'))!==folder||outputs.has(output)||!output.endsWith('.'+(j.format==='jpeg'?'jpg':j.format)))throw Error('成品路径越界或重复');
    indexes.add(p.index);pdfs.add(p.pdf);outputs.add(output);
  }
  return j;
}
export function parsePreparedReceipt(raw:string,jobId:string,requestKey:string):PreparedExportReceipt {
  if(raw.length>1500000)throw Error('准备凭据过大');
  const r=JSON.parse(raw.replace(/^\uFEFF/,'')) as PreparedExportReceipt;
  if(!r||r.schema!==1||r.jobId!==jobId||r.requestKey!==requestKey||!/^[a-f0-9]{32}$/.test(requestKey)||r.workingDocumentClosed!==true)throw Error('准备凭据不属于本次已完成任务');
  validateRasterJob(r.job,jobId);return r;
}
