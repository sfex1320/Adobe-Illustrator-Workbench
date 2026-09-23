import {expect,it} from 'vitest';
import {planArrangement, mapMeasuredArrangement} from '@aiq/core';
import type {ArrangementSettings,LayoutItem} from '@aiq/core';
import type {Bounds} from '@aiq/contracts';
const config:ArrangementSettings={columns:2,rows:2,columnGap:5,rowGap:7,order:'horizontal',sizing:'keep',position:'selection'};
const item=(id:string,bounds:Bounds,stackOrder?:number[]):LayoutItem=>({id,bounds,stackOrder});
const mixed=[item('d',[40,40,70,60],[0,0]),item('b',[40,0,60,10],[0,2]),item('c',[0,40,10,60],[1,0]),item('a',[0,0,10,10],[0,1])];
it('reorders current positions in Z or N order, never serpentine or input order',()=>{
 const z=planArrangement(mixed,config),n=planArrangement(mixed,{...config,order:'vertical'});
 expect(z.map(o=>o.id)).toEqual(['a','b','c','d']);expect(n.map(o=>o.id)).toEqual(['a','c','b','d']);
 expect(z[2]!.bounds[0]).toBe(z[0]!.bounds[0]);expect(n[1]!.bounds[1]).toBeGreaterThan(n[0]!.bounds[3]);
 const moved=mixed.map(o=>({...o,bounds:o.id==='a'?[80,80,90,90] as Bounds:o.bounds}));
 expect(planArrangement(moved,config)[0]!.id).toBe('b');
});
it('keeps top-aligned unequal heights in the same visual row',()=>{
 const tall=[item('lower',[0,30,10,40]),item('short',[30,0,40,10]),item('tall',[0,0,20,100])];
 expect(planArrangement(tall,config).map(o=>o.id)).toEqual(['tall','short','lower']);
});
it('keeps dimensions and original union top-left, or the explicit anchor center',()=>{
 const out=planArrangement(mixed,config);
 expect(Math.min(...out.map(o=>o.bounds[0]))).toBe(0);expect(Math.min(...out.map(o=>o.bounds[1]))).toBe(0);
 for(const o of out){const source=mixed.find(s=>s.id===o.id)!;expect(o.bounds[2]-o.bounds[0]).toBe(source.bounds[2]-source.bounds[0]);}
 const anchored=planArrangement(mixed,{...config,position:'anchor',anchorId:'d'}).find(o=>o.id==='d')!;
 expect(anchored.bounds).toEqual(mixed[0]!.bounds);
 expect(()=>planArrangement(mixed,{...config,position:'anchor',anchorId:'gone'})).toThrow('锚点');
});
it('fits each complete or incomplete row to total width with equal height and preserved ratios',()=>{
 const source=[...mixed,item('e',[0,80,20,100])];
 const out=planArrangement(source,{...config,sizing:'width',totalWidth:105});
 for(let start=0;start<out.length;start+=2){const row=out.slice(start,start+2);expect(row.at(-1)!.bounds[2]-row[0]!.bounds[0]).toBeCloseTo(105);for(const o of row){const b=source.find(s=>s.id===o.id)!.bounds;expect((o.bounds[2]-o.bounds[0])/(o.bounds[3]-o.bounds[1])).toBeCloseTo((b[2]-b[0])/(b[3]-b[1]));expect(o.bounds[3]-o.bounds[1]).toBeCloseTo(row[0]!.bounds[3]-row[0]!.bounds[1]);}}
 for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const a=out[i]!.bounds,b=out[j]!.bounds;expect(a[2]<=b[0]+1e-9||b[2]<=a[0]+1e-9||a[3]<=b[1]+1e-9||b[3]<=a[1]+1e-9).toBe(true);}
});
it('uses explicit hierarchical stacking order and rejects absent data',()=>{
 expect(planArrangement(mixed,{...config,order:'layer'}).map(o=>o.id)).toEqual(['d','a','b','c']);
 expect(()=>planArrangement([item('a',[0,0,10,10])],{...config,order:'layer'})).toThrow('叠放');
});
it('enforces board capacity, preserves size and moves no unselected board',()=>{
 const boards=Array.from({length:9},(_,i)=>item(String(i*2),[i*30,0,i*30+10,20]));
 const out=planArrangement(boards,{...config,order:'vertical',position:'anchor',anchorId:'8'},true);
 expect(out.map(o=>o.id).sort()).toEqual(boards.map(o=>o.id).sort());
 expect(out[4]!.bounds[0]).toBeGreaterThan(Math.max(...out.slice(0,4).map(o=>o.bounds[2]))+56);
 expect(out.find(o=>o.id==='8')!.bounds).toEqual(boards[4]!.bounds);
 expect(()=>planArrangement(boards,{...config,sizing:'width',totalWidth:100},true)).toThrow('画板');
});
it('rejects empty selection, overlap gaps, zero bounds and impossible target width',()=>{
 expect(()=>planArrangement([],config)).toThrow();expect(()=>planArrangement(mixed,{...config,rowGap:-1})).toThrow();
 expect(()=>planArrangement(mixed,{...config,sizing:'width',totalWidth:5})).toThrow();
 expect(()=>planArrangement([item('a',[0,0,0,10])],config)).toThrow();
});
it('maps measured glyph/mask transforms onto original frame coordinates with uniform scale',()=>{
 const source=[item('x',[-10,-20,110,90])],measured=[item('x',[0,0,100,50])],target=[item('x',[200,300,400,400])];
 expect(mapMeasuredArrangement(source,measured,target)[0]!.bounds).toEqual([180,260,420,480]);
 expect(()=>mapMeasuredArrangement([],measured,target)).toThrow();
});
