import type { Bounds, EditorObject } from '@aiq/contracts';
export function overallBounds(items:Array<{bounds:Bounds}>):Bounds {
  if(!items.length)throw Error('没有选择对象');
  return [Math.min(...items.map(o=>o.bounds[0])),Math.min(...items.map(o=>o.bounds[1])),Math.max(...items.map(o=>o.bounds[2])),Math.max(...items.map(o=>o.bounds[3]))];
}
export function centeredBounds(bounds:Bounds,width:number,height:number):Bounds {
  if(![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('宽高必须大于零');
  const cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2;
  return [cx-width/2,cy-height/2,cx+width/2,cy+height/2];
}
export function resizeEditorObjects(items:EditorObject[],w:number|undefined,h:number|undefined,proportional:boolean,together:boolean) {
  if(w===undefined&&h===undefined)throw Error('请输入宽或高');
  if([w,h].some(n=>n!==undefined&&(!Number.isFinite(n)||n<=0)))throw Error('宽高必须大于零');
  if(proportional&&w!==undefined&&h!==undefined)throw Error('等比缩放时只填写宽或高');
  const all=overallBounds(items);
  return items.map(o=>{const b=together?all:o.bounds,ow=b[2]-b[0],oh=b[3]-b[1];if(ow<=0||oh<=0)throw Error('零宽或零高对象不能缩放');const sx=w!==undefined?w/ow:proportional?h!/oh:1,sy=h!==undefined?h/oh:proportional?w!/ow:1,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;return {id:o.id,bounds:[cx+(o.bounds[0]-cx)*sx,cy+(o.bounds[1]-cy)*sy,cx+(o.bounds[2]-cx)*sx,cy+(o.bounds[3]-cy)*sy] as Bounds};});
}
export function distributeEditorObjects(items:EditorObject[],axis:'horizontal'|'vertical',mode:'centers'|'gaps'|'start'|'end',gap?:number) {
  if(items.length<(gap===undefined?3:2))throw Error(gap===undefined?'分布至少需要三个对象':'指定间距至少需要两个对象');
  if(gap!==undefined&&!Number.isFinite(gap))throw Error('间距须为有效数字');
  const k=axis==='horizontal'?0:1,end=k+2;
  const coordinate=(b:Bounds)=>mode==='centers'?(b[k]!+b[end]!)/2:mode==='end'?b[end]!:b[k]!;
  const sorted=[...items].sort((a,b)=>coordinate(a.bounds)-coordinate(b.bounds)),first=sorted[0]!.bounds,last=sorted[sorted.length-1]!.bounds;
  const step=gap??(mode==='gaps'?(last[end]!-first[k]!-sorted.reduce((s,o)=>s+o.bounds[end]!-o.bounds[k]!,0))/(items.length-1):(coordinate(last)-coordinate(first))/(items.length-1));
  let cursor=coordinate(first);
  return sorted.map(o=>{const b=[...o.bounds] as Bounds,delta=cursor-coordinate(b);b[k]!+=delta;b[end]!+=delta;cursor+=step+(mode==='gaps'?b[end]!-b[k]!:0);return {id:o.id,bounds:b};});
}
