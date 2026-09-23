import type { Bounds } from '@aiq/contracts';
export type LayoutItem = {id:string;bounds:Bounds;stackOrder?:number[]};
export interface ArrangementSettings {
 columns:number; rows:number; columnGap:number; rowGap:number;
 order:'horizontal'|'vertical'|'layer'|'index'; sizing:'keep'|'width';
 position:'selection'|'anchor'; anchorId?:string; totalWidth?:number;
}

function validateLayoutItems(items:LayoutItem[]){
 if(!items.length)throw Error('请选择排列对象');
 const ids=new Set<string>();
 for(const item of items){if(ids.has(item.id))throw Error('排列对象重复');ids.add(item.id);if(item.bounds.length!==4||item.bounds.some(n=>!Number.isFinite(n))||item.bounds[2]<=item.bounds[0]||item.bounds[3]<=item.bounds[1])throw Error('排列对象边界必须具有有效宽高');}
}
function layoutEnvelope(items:LayoutItem[]):Bounds{
 return items.reduce<Bounds>((b,o)=>[Math.min(b[0],o.bounds[0]),Math.min(b[1],o.bounds[1]),Math.max(b[2],o.bounds[2]),Math.max(b[3],o.bounds[3])],[Infinity,Infinity,-Infinity,-Infinity]);
}
/** Top/left aligned unequal sizes remain a row/column; center aligned objects are accepted too. */
export function arrangementSpatialOrder<T extends {bounds:Bounds}>(items:T[],vertical=false):T[]{
 const axis=vertical?0:1,other=vertical?1:0,groups:T[][]=[];
 const center=(o:T,k:number)=>(o.bounds[k]!+o.bounds[k+2]!)/2;
 for(const item of [...items].sort((a,b)=>a.bounds[axis]!-b.bounds[axis]!||a.bounds[other]!-b.bounds[other]!)){
  const group=groups.find(row=>{const first=row[0]!,tolerance=Math.min(first.bounds[axis+2]!-first.bounds[axis]!,item.bounds[axis+2]!-item.bounds[axis]!)*.45;return Math.abs(first.bounds[axis]!-item.bounds[axis]!)<=tolerance||Math.abs(center(first,axis)-center(item,axis))<=tolerance;});
  if(group)group.push(item);else groups.push([item]);
 }
 return groups.flatMap(group=>group.sort((a,b)=>a.bounds[other]!-b.bounds[other]!));
}

/** Shared y-down plan. Only board layouts use fixed-capacity blocks; objects flow to more rows/columns. */
export function planArrangement(items:LayoutItem[],settings:ArrangementSettings,artboards=false):LayoutItem[]{
 validateLayoutItems(items);
 const {columns,rows,columnGap,rowGap,order,sizing,position}=settings;
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>10000||rows>10000)throw Error('行数与列数须为 1–10000 的整数');
 if(![columnGap,rowGap].every(n=>Number.isFinite(n)&&n>=0))throw Error('排列间距须为非负数字，避免重叠');
 if(!['horizontal','vertical','layer','index'].includes(order)||!['keep','width'].includes(sizing)||!['selection','anchor'].includes(position))throw Error('排列设置无效');
 if(artboards&&sizing!=='keep')throw Error('画板排列只支持保留尺寸');
 let sorted:LayoutItem[];
 if(order==='layer'){
  if(artboards||items.some(o=>!o.stackOrder?.length||o.stackOrder.some(n=>!Number.isFinite(n))))throw Error('无法读取对象图层／叠放顺序，请改用空间顺序');
  sorted=[...items].sort((a,b)=>{const x=a.stackOrder!,y=b.stackOrder!;for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]!==y[i])return x[i]!-y[i]!;}return x.length-y.length;});
 }else if(order==='index'){
  if(!artboards||items.some(o=>!Number.isInteger(Number(o.id))))throw Error('画板编号无效');
  sorted=[...items].sort((a,b)=>Number(a.id)-Number(b.id));
 }else sorted=arrangementSpatialOrder(items,order==='vertical');
 const plans:LayoutItem[]=[],capacity=artboards?columns*rows:items.length;
 let blockX=0;
 for(let offset=0;offset<sorted.length;offset+=capacity){
  const block=sorted.slice(offset,offset+capacity),vertical=order==='vertical';
  const actualRows=vertical?Math.min(rows,block.length):Math.ceil(block.length/columns),actualColumns=vertical?Math.ceil(block.length/rows):Math.min(columns,block.length);
  const cells=block.map((o,i)=>({o,row:vertical?i%rows:Math.floor(i/columns),column:vertical?Math.floor(i/rows):i%columns}));
  const rowHeights=Array<number>(actualRows).fill(0),columnWidths=Array<number>(actualColumns).fill(0);
  for(const {o,row,column} of cells){rowHeights[row]=Math.max(rowHeights[row]!,o.bounds[3]-o.bounds[1]);columnWidths[column]=Math.max(columnWidths[column]!,o.bounds[2]-o.bounds[0]);}
  if(sizing==='width'){
   const totalWidth=settings.totalWidth;
   if(totalWidth===undefined||!Number.isFinite(totalWidth)||totalWidth<=0)throw Error('请填写大于零的固定总宽');
   for(let row=0;row<actualRows;row++){
    const members=cells.filter(c=>c.row===row),available=totalWidth-columnGap*(members.length-1);
    if(available<=0)throw Error('固定总宽不足以容纳列间距');
    rowHeights[row]=available/members.reduce((sum,{o})=>sum+(o.bounds[2]-o.bounds[0])/(o.bounds[3]-o.bounds[1]),0);
   }
  }
  const xs=[0],ys=[0];columnWidths.forEach((w,i)=>xs.push(xs[i]!+w+columnGap));rowHeights.forEach((h,i)=>ys.push(ys[i]!+h+rowGap));
  const rowCursors=Array<number>(actualRows).fill(0),placed:LayoutItem[]=[];
  // Width rows need x coordinates computed in column order, independently of traversal order.
  const positions=new Map<string,Bounds>();
  for(const {o,row,column} of [...cells].sort((a,b)=>a.row-b.row||a.column-b.column)){
   const sourceWidth=o.bounds[2]-o.bounds[0],sourceHeight=o.bounds[3]-o.bounds[1],scale=sizing==='width'?rowHeights[row]!/sourceHeight:1;
   const w=sourceWidth*scale,h=sourceHeight*scale,x=sizing==='width'?rowCursors[row]!:xs[column]!+(columnWidths[column]!-w)/2,y=ys[row]!+(rowHeights[row]!-h)/2;
   positions.set(o.id,[x+blockX,y,x+w+blockX,y+h]);rowCursors[row]=x+w+columnGap;
  }
  for(const o of block)placed.push({id:o.id,bounds:positions.get(o.id)!});
  // Remove unused cell margins so original selection top-left means actual visible bounds.
  const box=layoutEnvelope(placed);
  for(const o of placed)plans.push({id:o.id,bounds:[o.bounds[0]-box[0]+blockX,o.bounds[1]-box[1],o.bounds[2]-box[0]+blockX,o.bounds[3]-box[1]]});
  blockX+=box[2]-box[0]+Math.max(56.692913386,columnGap*2);
 }
 const before=layoutEnvelope(items),after=layoutEnvelope(plans);
 let dx=before[0]-after[0],dy=before[1]-after[1];
 if(position==='anchor'){
  const anchor=items.find(o=>o.id===settings.anchorId),placed=plans.find(o=>o.id===settings.anchorId);
  if(!anchor||!placed)throw Error('排列锚点已失效，请重新指定');
  dx=(anchor.bounds[0]+anchor.bounds[2]-placed.bounds[0]-placed.bounds[2])/2;dy=(anchor.bounds[1]+anchor.bounds[3]-placed.bounds[1]-placed.bounds[3])/2;
 }
 const result=plans.map(o=>({id:o.id,bounds:[o.bounds[0]+dx,o.bounds[1]+dy,o.bounds[2]+dx,o.bounds[3]+dy] as Bounds}));
 validateLayoutItems(result);return result;
}

/** Convert measured glyph/mask geometry to frame targets without confusing either coordinate space. */
export function mapMeasuredArrangement(originals:LayoutItem[],measured:LayoutItem[],plan:LayoutItem[]):LayoutItem[]{
 validateLayoutItems(originals);validateLayoutItems(measured);validateLayoutItems(plan);
 return plan.map(target=>{
  const original=originals.find(o=>o.id===target.id),source=measured.find(o=>o.id===target.id);
  if(!original||!source)throw Error('测量对象已失效，请重新排列');
  const m=source.bounds,t=target.bounds,b=original.bounds,sx=(t[2]-t[0])/(m[2]-m[0]),sy=(t[3]-t[1])/(m[3]-m[1]);
  if(Math.abs(sx-sy)>1e-7)throw Error('排列只允许等比缩放');
  return {id:target.id,bounds:[t[0]+(b[0]-m[0])*sx,t[1]+(b[1]-m[1])*sy,t[0]+(b[2]-m[0])*sx,t[1]+(b[3]-m[1])*sy]};
 });
}
export type BoardOrder = 'index'|'snake'|'vertical'|'horizontal';
/** Cluster by overlap of center lines; stable ties retain input order. Coordinates are y-down. */
export function visualOrder<T extends {bounds:Bounds}>(items:T[],vertical=false):T[] {
 const k=vertical?0:1,other=vertical?1:0;
 const center=(x:T,axis:number)=>(x.bounds[axis]!+x.bounds[axis+2]!)/2;
 const pending=[...items].sort((a,b)=>center(a,k)-center(b,k));const rows:T[][]=[];
 for(const item of pending){const row=rows.find(r=>Math.abs(center(r[0]!,k)-center(item,k))<=Math.min(r[0]!.bounds[k+2]!-r[0]!.bounds[k]!,item.bounds[k+2]!-item.bounds[k]!)*.45);if(row)row.push(item);else rows.push([item]);}
 return rows.flatMap(row=>row.sort((a,b)=>center(a,other)-center(b,other)));
}
export function orderBoards<T extends {index:number;bounds:Bounds}>(items:T[],order:BoardOrder):T[]{
 if(order==='index')return [...items].sort((a,b)=>a.index-b.index);
 const sorted=visualOrder(items,order==='vertical');if(order!=='snake')return sorted;
 const rows:T[][]=[];for(const item of sorted){const last=rows[rows.length-1],base=last?.[0];if(base&&Math.abs((base.bounds[1]+base.bounds[3]-item.bounds[1]-item.bounds[3])/2)<=Math.min(base.bounds[3]-base.bounds[1],item.bounds[3]-item.bounds[1])*.45)last!.push(item);else rows.push([item]);}
 return rows.flatMap((row,i)=>i%2?[...row].reverse():row);
}
export function arrangeGrid(items:LayoutItem[],columns:number,rows:number,columnGap:number,rowGap:number,anchorId?:string):LayoutItem[]{
 if(!items.length)throw Error('请选择排列对象');
 if(!Number.isInteger(columns)||columns<1||!Number.isInteger(rows)||rows<1||columns>10000||rows>10000)throw Error('行数与列数须为 1–10000 的整数');
 if(!Number.isFinite(columnGap)||!Number.isFinite(rowGap))throw Error('间距须为有效数字');
 const sorted=visualOrder(items),actualRows=Math.max(rows,Math.ceil(items.length/columns));
 const widths=Array.from({length:Math.min(columns,items.length)},(_,c)=>Math.max(...sorted.filter((_,i)=>i%columns===c).map(o=>o.bounds[2]-o.bounds[0])));
 const heights=Array.from({length:Math.min(actualRows,Math.ceil(items.length/columns))},(_,r)=>Math.max(...sorted.slice(r*columns,(r+1)*columns).map(o=>o.bounds[3]-o.bounds[1])));
 const x=[0],y=[0];widths.forEach((w,i)=>x.push(x[i]!+w+columnGap));heights.forEach((h,i)=>y.push(y[i]!+h+rowGap));
 const anchor=sorted.find(o=>o.id===anchorId)??sorted[0]!,anchorIndex=sorted.indexOf(anchor);
 const center=(o:LayoutItem,k:number)=>(o.bounds[k]!+o.bounds[k+2]!)/2;
 const originX=center(anchor,0)-x[anchorIndex%columns]!-widths[anchorIndex%columns]!/2;
 const originY=center(anchor,1)-y[Math.floor(anchorIndex/columns)]!-heights[Math.floor(anchorIndex/columns)]!/2;
 return sorted.map((o,i)=>{const c=i%columns,r=Math.floor(i/columns),dx=originX+x[c]!+widths[c]!/2-center(o,0),dy=originY+y[r]!+heights[r]!/2-center(o,1);return {id:o.id,bounds:[o.bounds[0]+dx,o.bounds[1]+dy,o.bounds[2]+dx,o.bounds[3]+dy] as Bounds};});
}

/** Fixed-capacity board blocks laid left-to-right; anchor center remains fixed. */
export function arrangeBoardGrid(items:LayoutItem[],columns:number,rows:number,columnGap:number,rowGap:number,anchorId?:string):LayoutItem[]{
 if(!Number.isInteger(columns)||columns<1||!Number.isInteger(rows)||rows<1)throw Error('行列必须为正整数');
 const sorted=visualOrder(items),capacity=columns*rows,plans:LayoutItem[]=[];
 let nextX=0;
 for(let offset=0;offset<sorted.length;offset+=capacity){
  const block=arrangeGrid(sorted.slice(offset,offset+capacity),columns,rows,columnGap,rowGap);
  const left=Math.min(...block.map(o=>o.bounds[0])),top=Math.min(...block.map(o=>o.bounds[1]));
  for(const o of block)plans.push({id:o.id,bounds:[o.bounds[0]-left+nextX,o.bounds[1]-top,o.bounds[2]-left+nextX,o.bounds[3]-top]});
  nextX+=Math.max(...block.map(o=>o.bounds[2]))-left+Math.max(56.692913386,columnGap*2);
 }
 if(!plans.length)throw Error('请选择画板');
 const anchor=sorted.find(o=>o.id===anchorId)??sorted[0]!,placed=plans.find(o=>o.id===anchor.id)!;
 const dx=(anchor.bounds[0]+anchor.bounds[2]-placed.bounds[0]-placed.bounds[2])/2,dy=(anchor.bounds[1]+anchor.bounds[3]-placed.bounds[1]-placed.bounds[3])/2;
 return plans.map(o=>({id:o.id,bounds:[o.bounds[0]+dx,o.bounds[1]+dy,o.bounds[2]+dx,o.bounds[3]+dy]}));
}
