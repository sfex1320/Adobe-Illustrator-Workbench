import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function fixture(){
 const files=new Map<string,string>();const stats={saves:0,opens:0,saveFails:false,openFails:false,closeFails:false,pdfCompatible:undefined as unknown};
 class File{
  constructor(public name:string){}
  get exists(){return files.has(this.name);}get length(){return files.get(this.name)?.length??0;}
  remove(){return files.delete(this.name);}
 }
 const documents:unknown[]=[];
 const app={documents,open(){stats.opens++;if(stats.openFails)throw Error('open failed');const doc={layers:[],artboards:[{artboardRect:[],name:''}],close(){if(stats.closeFails)throw Error('close failed');documents.splice(documents.indexOf(doc),1);}};documents.push(doc);return doc;}};
 const context=vm.createContext({File,Folder:{temp:'/tmp'},app,SaveOptions:{DONOTSAVECHANGES:0},mockSave(_doc:unknown,file:File,pdf:unknown){stats.saves++;stats.pdfCompatible=pdf;files.set(file.name,'native AI');if(stats.saveFails)throw Error('save failed');}});
 const hook='savePackageCopy=mockSave;planDeliveryLayers=function(){return {layers:[]};};return {snapshot:snapshotDeliveryDocument,close:closeDeliveryDocument,release:releaseSnapshotFile,check:checkDeliveryDocuments};';
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};',hook),context);
 const api=context.AIQ;
 const lease={file:null,openDocuments:0,released:false,saves:0};
 const open=(name='Page')=>api.snapshot({},'rgb',[[0,100,100,0]],[name],lease);
 const release=()=>{lease.released=true;api.release(lease);};
 return {api,lease,open,release,stats,files,documents};
}
describe('One snapshot per export batch',()=>{
 it('saves once, independently opens each page, and deletes at batch completion',()=>{const f=fixture();const a=f.open('A');f.api.close(a);expect(f.files.size).toBe(1);const b=f.open('B');expect(b).not.toBe(a);expect(b.artboards[0].name).toBe('B');f.api.close(b);expect(f.stats.saves).toBe(1);f.release();expect(f.files.size).toBe(0);});
 it('retains the file while its working document is open',()=>{const f=fixture();const d=f.open();f.release();expect(f.files.size).toBe(1);f.api.close(d);expect(f.files.size).toBe(0);});
 it('never opens a partial save on a later page',()=>{const f=fixture();f.stats.saveFails=true;expect(()=>f.open()).toThrow(/save failed/);expect(()=>f.open()).toThrow(/快照无效/);expect(f.stats.opens).toBe(0);f.release();expect(f.files.size).toBe(0);});
 it('cleans the batch snapshot after open fails',()=>{const f=fixture();f.stats.openFails=true;expect(()=>f.open()).toThrow(/open failed/);f.release();expect(f.files.size).toBe(0);});
 it('retains failed-close ownership and cleans after the user closes that worker',()=>{const f=fixture();const d=f.open();f.stats.closeFails=true;expect(()=>f.api.close(d)).toThrow(/close failed/);f.release();expect(f.files.size).toBe(1);expect(()=>f.api.check()).toThrow(/尚未关闭/);f.documents.length=0;f.api.check();expect(f.files.size).toBe(0);expect(f.lease.openDocuments).toBe(0);});
 it('does not reuse a snapshot in another batch',()=>{const f=fixture();f.api.close(f.open());f.release();const other={file:null,openDocuments:0,released:false,saves:0};const d=f.api.snapshot({},'rgb',[[0,100,100,0]],['New'],other);f.api.close(d);other.released=true;f.api.release(other);expect(f.stats.saves).toBe(2);expect(f.files.size).toBe(0);});
});
