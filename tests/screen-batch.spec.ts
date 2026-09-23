import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
const ctx=vm.createContext({ExportForScreensType:{SE_PNG24:1,SE_JPEG100:2,SE_JPEG80:3,SE_JPEG50:4,SE_JPEG20:5}});
vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {end:screenBatchEnd,type:screenDeliveryType,canBatch:canBatchScreens};'),ctx);
it('bounds native batches and separates duplicate/unsafe filenames without changing source names',()=>{
 for(const [names,end] of [[['A','B','C'],3],[['A','a'],1],[['A','bad/name'],1],[['bad/name','B'],1],[Array.from({length:20},(_,i)=>'page'+i),8]] as const){
  ctx.pages=names.map(name=>({name}));expect(vm.runInContext('AIQ.end(pages,0)',ctx)).toBe(end);expect(ctx.pages).toEqual(names.map(name=>({name})));
 }
});
it('never substitutes RGB for CMYK or rounds custom JPEG quality',()=>{
 expect(vm.runInContext("AIQ.type({format:'jpeg',quality:80},'rgb')",ctx)).toBe(1);
 expect(vm.runInContext("AIQ.type({format:'jpeg',quality:73},'cmyk')",ctx)).toBeNull();
 expect(vm.runInContext("AIQ.type({format:'jpeg',quality:80},'cmyk')",ctx)).toBe(3);
});

it('RGB JPEG uses PNG pixels for native codec rather than a CMYK screen JPEG',()=>{expect(vm.runInContext("AIQ.type({format:'jpeg',quality:80},'rgb')",ctx)).toBe(1);});
