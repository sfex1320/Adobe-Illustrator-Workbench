import polygonClipping, { type MultiPolygon, type Pair } from 'polygon-clipping';
import type { GroupRegion } from '@aiq/contracts';

const area=(ring:Pair[])=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
const totalArea=(polys:MultiPolygon)=>polys.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(area(r)),0),0);
function contains(ring:Pair[],p:Pair){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i]!,b=ring[j]!;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function strokeRegion(stroke:NonNullable<GroupRegion['stroke']>):MultiPolygon {
 const p=stroke.points.filter((v,i,a)=>!i||v[0]!==a[i-1]![0]||v[1]!==a[i-1]![1]);
 if(p.length>1&&p[0]![0]===p[p.length-1]![0]&&p[0]![1]===p[p.length-1]![1])p.pop();
 if(p.length<2||stroke.width<=0)return [];
 const r=stroke.width/2,n=stroke.closed?p.length:p.length-1,shapes:MultiPolygon=[],dirs:Pair[]=[];
 const circle=(c:Pair)=>{const count=Math.min(256,Math.max(16,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-.05/r)))));shapes.push([Array.from({length:count},(_,i)=>[c[0]+r*Math.cos(i*2*Math.PI/count),c[1]+r*Math.sin(i*2*Math.PI/count)] as Pair)]);};
 for(let i=0;i<n;i++){
  const a=p[i]!,b=p[(i+1)%p.length]!,len=Math.hypot(b[0]-a[0],b[1]-a[1]),d:Pair=[(b[0]-a[0])/len,(b[1]-a[1])/len];dirs.push(d);
  const start=!stroke.closed&&i===0&&stroke.cap==='square'?r:0,end=!stroke.closed&&i===n-1&&stroke.cap==='square'?r:0;
  shapes.push([[[a[0]-d[0]*start-d[1]*r,a[1]-d[1]*start+d[0]*r],[b[0]+d[0]*end-d[1]*r,b[1]+d[1]*end+d[0]*r],[b[0]+d[0]*end+d[1]*r,b[1]+d[1]*end-d[0]*r],[a[0]-d[0]*start+d[1]*r,a[1]-d[1]*start-d[0]*r]]]);
 }
 for(let i=stroke.closed?0:1;i<(stroke.closed?p.length:p.length-1);i++){
  const c=p[i]!,a=dirs[(i-1+n)%n]!,b=dirs[i%n]!,cross=a[0]*b[1]-a[1]*b[0];
  if(Math.abs(cross)<1e-10)continue;
  if(stroke.join==='round'){circle(c);continue;}
  const sign=cross>0?-1:1,q:Pair=[c[0]-a[1]*r*sign,c[1]+a[0]*r*sign],s:Pair=[c[0]-b[1]*r*sign,c[1]+b[0]*r*sign];
  const t=((s[0]-q[0])*b[1]-(s[1]-q[1])*b[0])/cross,m:Pair=[q[0]+t*a[0],q[1]+t*a[1]];
  shapes.push([stroke.join==='miter'&&Math.hypot(m[0]-c[0],m[1]-c[1])<=r*stroke.miterLimit?[c,q,m,s]:[c,q,s]]);
 }
 if(!stroke.closed&&stroke.cap==='round'){circle(p[0]!);circle(p[p.length-1]!);}
 return shapes.length?polygonClipping.union(shapes):[];
}
export function visibleGroupRegion(node:GroupRegion):MultiPolygon {
 let result:MultiPolygon=[];
 const rings=(node.rings??[]).filter(r=>r.length>=3).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
 for(let i=0;i<rings.length;i++){
  const ring=rings[i]!,shape:MultiPolygon=[[ring]];
  if(node.evenodd){result=polygonClipping.xor(result,shape);continue;}
  let winding=0;
  for(let j=0;j<i;j++){
   const outer=rings[j]!,overlap=totalArea(polygonClipping.intersection([[outer]],shape));
   if(overlap>1e-6&&Math.abs(overlap-Math.abs(area(ring)))>1e-4)throw Error('交叠复合子路径暂不支持智能群组，请先整理为普通填色路径');
   if(contains(outer,ring[0]!))winding+=Math.sign(area(outer));
  }
  const after=winding+Math.sign(area(ring));
  if(!winding&&after)result=polygonClipping.union(result,shape);
  else if(winding&&!after)result=polygonClipping.difference(result,shape);
 }
 for(const child of node.children??[])result=polygonClipping.union(result,visibleGroupRegion(child));
 if(node.stroke)result=polygonClipping.union(result,strokeRegion(node.stroke));
 if(node.clip)result=polygonClipping.intersection(result,visibleGroupRegion(node.clip));
 return result;
}
/** Connected components of positive-area overlap. Edge-only contact stays separate. */
export function smartGroupComponents(nodes:GroupRegion[]):number[][] {
 if(nodes.length>300)throw Error('智能群组一次最多处理 300 个对象');
 const shapes=nodes.map(visibleGroupRegion),parents=nodes.map((_,i)=>i);
 const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]!));
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
  if(root(i)!==root(j)&&totalArea(polygonClipping.intersection(shapes[i]!,shapes[j]!))>1e-6)parents[root(j)]=root(i);
 }
 const groups=new Map<number,number[]>();parents.forEach((_,i)=>{const r=root(i);groups.set(r,[...(groups.get(r)??[]),i]);});
 return [...groups.values()].filter(g=>g.length>1);
}

/** Assign complete roots once, using clipped regions rather than mask bounding boxes. */
export function artboardOwners(nodes:GroupRegion[],boards:Array<{index:number;bounds:readonly number[]}>):number[]{
 const regions=boards.map(b=>{const [l,t,r,bottom]=b.bounds as [number,number,number,number];return [[[l,-t],[r,-t],[r,-bottom],[l,-bottom]]] as Pair[][];});
 return nodes.map(node=>{const shape=visibleGroupRegion(node);let owner=-1,best=1e-6;
  let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
  for(const poly of shape)for(const ring of poly)for(const [x,y] of ring){left=Math.min(left,x);right=Math.max(right,x);top=Math.max(top,y);bottom=Math.min(bottom,y);}
  boards.forEach((board,i)=>{const b=board.bounds;if(right<=b[0]!||left>=b[2]!||top<=-b[3]!||bottom>=-b[1]!)return;const size=totalArea(polygonClipping.intersection(shape,[regions[i]!]));if(size>best+1e-6||(Math.abs(size-best)<1e-6&&owner>=0&&board.index<owner)){best=size;owner=board.index;}});return owner;
 });
}
