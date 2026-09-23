import {expect,it} from 'vitest';
import {parseExportProgress,validateRasterJob} from '../packages/host-adapter/src/export-job-store.js';
const progress={jobId:'job-fixture-01',total:2,current:1,completed:1,failed:0,completedIndexes:[0],status:'running'};
it('accepts historical progress and refuses corrupt counters or UI values',()=>{
 expect(parseExportProgress(JSON.stringify(progress),progress.jobId)).toEqual(progress);
 for(const bad of [{message:{}},{prepared:3},{phase:'invented'},{updatedAt:-1},{completed:2,completedIndexes:[0,0]},{failed:2},{jobId:'other'}]){
  expect(parseExportProgress(JSON.stringify({...progress,...bad}),progress.jobId)).toBeNull();
 }
 expect(parseExportProgress('{',progress.jobId)).toBeNull();
});
it('allows output at drive and share roots but refuses alternate streams and traversal',()=>{
 const job={protocol:1,jobId:progress.jobId,format:'jpeg',color:'rgb',ppi:72,scale:1,quality:100,profile:'source',iccPath:'',transparent:true,optimize:true};
 for(const folder of ['G:/','//server/share/']){
  expect(()=>validateRasterJob({...job,folder,pages:[{index:0,pdf:'page-0.pdf',output:folder+'one.jpg',sizePt:[100,200]}]},job.jobId)).not.toThrow();
 }
 for(const output of ['G:/out/one:stream.jpg','G:/out/../one.jpg','G:/outside/one.jpg']){
  expect(()=>validateRasterJob({...job,folder:'G:/out',pages:[{index:0,pdf:'page-0.pdf',output,sizePt:[100,200]}]},job.jobId)).toThrow();
 }
});
