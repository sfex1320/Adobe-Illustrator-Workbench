import bwip from 'bwip-js/generic';
export function barcodePlan(text:string,format:'code128'|'ean13'):{text:string;width:number;bars:Array<[number,number]>}{
 if(!text.length||text.length>100)throw Error('条码内容须为 1–100 字符');
 let normalized=text;
 if(format==='ean13'){
  if(!/^\d{12,13}$/.test(text))throw Error('EAN-13 须为 12 位数据或含校验位的 13 位数字');
  const sum=text.slice(0,12).split('').reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0),digit=String((10-sum%10)%10);
  if(text.length===13&&text[12]!==digit)throw Error('EAN-13 校验位不正确');
  normalized=text.slice(0,12)+digit;
 }else if(!/^[\x20-\x7e]+$/.test(text))throw Error('Code 128 当前支持可打印英文、数字和符号；中文前缀请放在标签说明中');
 const raw=bwip.raw({bcid:format,text:normalized}) as Array<{sbs?:number[]}>;
 const widths=raw[0]?.sbs;if(raw.length!==1||!widths?.length)throw Error('条码引擎未返回一维条纹');
 let x=0;const bars:Array<[number,number]>=[];
 widths.forEach((w,i)=>{if(!Number.isFinite(w)||w<=0)throw Error('条码条纹宽度无效');if(i%2===0)bars.push([x,w]);x+=w;});
 return {text:normalized,width:x,bars};
}
