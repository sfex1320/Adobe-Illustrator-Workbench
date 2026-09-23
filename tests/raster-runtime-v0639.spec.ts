import {afterEach,expect,it,vi} from 'vitest';
import {requireRasterRuntime} from '../packages/host-adapter/src/raster';
afterEach(()=>vi.unstubAllGlobals());
function fixture(missing=''){
 const calls:string[]=[];
 vi.stubGlobal('__adobe_cep__',{getSystemPath:()=> 'C:/AIQ'});
 vi.stubGlobal('cep',{process:{createProcess:vi.fn(()=>{throw Error('Must not launch');})},fs:{stat:(p:string)=>{calls.push(p);return {err:p.endsWith(missing)&&!!missing?2:0};}}});
 return calls;
}
it('rejects a missing engine before creating a job or launching a process',()=>{
 for(const file of ['gswin64c.exe','gsdll64.dll','jpegtran.exe','jpeg62.dll']){fixture(file);expect(()=>requireRasterRuntime()).toThrow('组件未安装');}
});
it('accepts the complete installed runtime without writing or launching',()=>{
 const calls=fixture();expect(()=>requireRasterRuntime()).not.toThrow();expect(calls).toHaveLength(5);
});
it('rejects a missing worker and a browser without CEP',()=>{
 fixture('AIQRaster.exe');expect(()=>requireRasterRuntime()).toThrow('程序未安装');vi.unstubAllGlobals();expect(()=>requireRasterRuntime()).toThrow('CEP');
});
