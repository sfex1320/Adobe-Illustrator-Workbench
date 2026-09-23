import fs from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=fs.readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function extract(bytes:Buffer,kind:string){
 let at=0;
 const file={length:bytes.length,encoding:'',open:()=>true,close:()=>{},seek:(n:number)=>{at=n;},read:(n:number)=>{const v=bytes.subarray(at,at+n).toString('latin1');at+=n;return v;}};
 const c=vm.createContext({file,kind});vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {icc:deliveryEmbeddedICC};'),c);
 return vm.runInContext('AIQ.icc(file,kind)',c);
}
it('reads the original PSD and TIFF profile bytes instead of trusting a Photoshop profile name',()=>{
 const icc=Buffer.alloc(128,7);icc.write('acsp',36);
 const psd=Buffer.alloc(34+12+icc.length);psd.write('8BPS');psd.writeUInt16BE(1,4);psd.writeUInt32BE(140,30);psd.write('8BIM',34);psd.writeUInt16BE(1039,38);psd.writeUInt32BE(128,42);icc.copy(psd,46);
 const tif=Buffer.alloc(26+icc.length);tif.write('II');tif.writeUInt16LE(42,2);tif.writeUInt32LE(8,4);tif.writeUInt16LE(1,8);tif.writeUInt16LE(34675,10);tif.writeUInt16LE(7,12);tif.writeUInt32LE(128,14);tif.writeUInt32LE(26,18);icc.copy(tif,26);
 expect(extract(psd,'psd')).toBe(icc.toString('latin1'));expect(extract(tif,'tif')).toBe(extract(psd,'psd'));
 tif[70]=8;expect(extract(tif,'tif')).not.toBe(extract(psd,'psd'));
 tif.writeUInt32LE(999999,18);expect(()=>extract(tif,'tif')).toThrow('ICC 数据范围无效');
});
