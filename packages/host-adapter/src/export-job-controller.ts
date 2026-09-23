import {CoreError} from '@aiq/contracts';
import type {EditorRequest, EditorResult} from '@aiq/contracts';
import type {CepBridge} from './bridge.js';
import {parsePreparedReceipt} from './export-job-store.js';
type Disk={read(name:string):string|null;remove(name:string):void};
type Pending={signature:string;key:string;timedOut:boolean;completion:Promise<void>;recovery?:Promise<EditorResult>};
/** Retains ownership across a UI deadline. Generic bridge late replies remain discarded. */
export class ExportPreparationController {
  private readonly pending=new Map<string,Pending>();
  constructor(private readonly bridge:CepBridge, private readonly disk:Disk, private readonly key:()=>string) {}
  async start(request:EditorRequest):Promise<EditorResult>{
    const a=request.action;
    if(a.type!=='export'||a.rasterEngine!=='independent'||!a.jobId||!/^[a-zA-Z0-9_-]{8,80}$/.test(a.jobId))throw Error('独立任务请求无效');
    if(this.pending.has(a.jobId)||this.disk.read('prepared-'+a.jobId+'.json'))throw Error('该任务已启动，请勿重复导出');
    const key=this.key();if(!/^[a-f0-9]{32}$/.test(key))throw Error('无法生成任务凭据');
    const record:Pending={signature:JSON.stringify(request),key,timedOut:false,completion:Promise.resolve()};
    this.pending.set(a.jobId,record);
    const call=this.bridge.send<EditorResult>('EDIT_DOCUMENT',{...request,action:{...a,preparationKey:key}},600000);
    record.completion=this.bridge.idle();
    try{return await call;}
    catch(error){if(error instanceof CoreError&&error.code==='HOST_TIMEOUT')record.timedOut=true;else this.pending.delete(a.jobId);throw error;}
    finally{if(!record.timedOut)this.pending.delete(a.jobId);}
  }
  isUncertain(jobId:string):boolean{return this.pending.get(jobId)?.timedOut===true;}
  async recover(request:EditorRequest):Promise<EditorResult>{
    const id=request.action.type==='export'?request.action.jobId:undefined,record=id?this.pending.get(id):undefined;
    if(!id||!record||!record.timedOut)throw Error('无法接续：没有本次任务的在途所有权');
    if(record.signature!==JSON.stringify(request))throw Error('任务请求已经改变，拒绝接续');
    if(!record.recovery)record.recovery=(async()=>{
      await record.completion;
      const raw=this.disk.read('prepared-'+id+'.json');
      if(!raw)throw Error('宿主已返回，但没有完整准备凭据；未启动渲染，请检查任务详情');
      const receipt=parsePreparedReceipt(raw,id,record.key);
      return {status:'completed',message:'宿主准备已结束，接续同一导出任务',selectedObjectIds:[],skipped:[],sideEffects:[],rasterJob:receipt.job} satisfies EditorResult;
    })().finally(()=>{this.pending.delete(id);});
    return record.recovery;
  }
}
