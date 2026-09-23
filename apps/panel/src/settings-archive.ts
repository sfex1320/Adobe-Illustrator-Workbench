/** Small, interoperable ZIP (STORE) with one settings.json entry; no artwork. */
const encoder=new TextEncoder();
function crc(bytes:Uint8Array){let value=0xffffffff;for(const b of bytes){value^=b;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
export function packSettings(raw:string):Uint8Array {
 const data=encoder.encode(raw),name=encoder.encode('settings.json');
 if(data.length>1048576)throw Error('设置超过 1 MB');
 const size=30+name.length+data.length,bytes=new Uint8Array(size+46+name.length+22),v=new DataView(bytes.buffer);
 const u16=(i:number,n:number)=>v.setUint16(i,n,true),u32=(i:number,n:number)=>v.setUint32(i,n,true);
 u32(0,0x04034b50);u16(4,20);u16(6,0x800);u32(14,crc(data));u32(18,data.length);u32(22,data.length);u16(26,name.length);bytes.set(name,30);bytes.set(data,30+name.length);
 u32(size,0x02014b50);u16(size+4,20);u16(size+6,20);u16(size+8,0x800);u32(size+16,crc(data));u32(size+20,data.length);u32(size+24,data.length);u16(size+28,name.length);bytes.set(name,size+46);
 const end=size+46+name.length;u32(end,0x06054b50);u16(end+8,1);u16(end+10,1);u32(end+12,46+name.length);u32(end+16,size);return bytes;
}
export function unpackSettings(bytes:Uint8Array):string {
 if(bytes.length<100||bytes.length>1050000)throw Error('设置 ZIP 大小不正确');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=(i:number)=>v.getUint16(i,true),u32=(i:number)=>v.getUint32(i,true);
 const length=u32(22),nameLength=u16(26),start=30+nameLength+u16(28),end=bytes.length-22;
 if(u32(0)!==0x04034b50||u16(8)!==0||u32(18)!==length||length>1048576||start+length>end||u32(end)!==0x06054b50||u16(end+10)!==1||new TextDecoder().decode(bytes.subarray(30,30+nameLength))!=='settings.json')throw Error('不是工作台生成的设置 ZIP');
 const data=bytes.subarray(start,start+length);if(crc(data)!==u32(14))throw Error('设置 ZIP 校验失败');return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
export function archiveToBase64(bytes:Uint8Array){let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);}
export function archiveFromBase64(raw:string){return Uint8Array.from(atob(raw),c=>c.charCodeAt(0));}
