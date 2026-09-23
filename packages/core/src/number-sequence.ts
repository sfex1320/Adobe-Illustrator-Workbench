export interface NumberSequence {start:number;step:number;count:number;digits:number;prefix:string;suffix:string}
export function numberSequence(p:NumberSequence):string[]{
 if(!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.step)||p.step===0)throw Error('起始值和步长须为安全整数，步长不能为零');
 if(!Number.isInteger(p.count)||p.count<1||p.count>300)throw Error('每批数量须为 1–300');
 if(!Number.isInteger(p.digits)||p.digits<1||p.digits>16)throw Error('位数须为 1–16');
 if(p.prefix.length+p.suffix.length>120)throw Error('前后缀合计不能超过 120 字符');
 return Array.from({length:p.count},(_,i)=>{const n=p.start+i*p.step;if(!Number.isSafeInteger(n))throw Error('编号超出安全整数范围');return p.prefix+(n<0?'-':'')+Math.abs(n).toString().padStart(p.digits,'0')+p.suffix;});
}
