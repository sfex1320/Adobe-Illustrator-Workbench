import {expect,it} from 'vitest';
import {arrangeGrid,orderBoards,distributeEditorObjects,resizeEditorObjects} from '@aiq/core';
import type {Bounds,EditorObject} from '@aiq/contracts';
const object=(id:string,bounds:Bounds)=>({id,bounds,kind:'path',fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null}) satisfies EditorObject;
it('wraps six objects into four columns without moving the anchored center',()=>{
 const items=Array.from({length:6},(_,i)=>({id:String(i),bounds:[i*20,0,i*20+10,10] as Bounds}));
 const result=arrangeGrid(items,4,1,5,8,'0');
 expect(result.map(o=>o.bounds)).toEqual([[0,0,10,10],[15,0,25,10],[30,0,40,10],[45,0,55,10],[0,18,10,28],[15,18,25,28]]);
 const anchored=arrangeGrid(items,4,1,5,8,'4');expect(anchored.find(o=>o.id==='4')?.bounds).toEqual(items[4]?.bounds);
});
it('handles unequal size centers, negative gaps, and arbitrary selected artboards',()=>{
 const result=arrangeGrid([{id:'2',bounds:[0,0,20,10]},{id:'7',bounds:[50,0,80,10]}],2,1,-5,0,'2');
 expect(result.map(o=>o.bounds)).toEqual([[0,0,20,10],[15,0,45,10]]);
 expect(()=>arrangeGrid([],2,1,0,0)).toThrow();expect(()=>arrangeGrid(result,0,1,0,0)).toThrow();expect(()=>arrangeGrid(result,2,1,NaN,0)).toThrow();
});
it('orders shuffled artboards by index, snake and vertical, independent of their names',()=>{
 const boards=[{index:0,bounds:[0,0,10,10] as Bounds},{index:1,bounds:[20,20,30,30] as Bounds},{index:2,bounds:[20,0,30,10] as Bounds},{index:3,bounds:[0,20,10,30] as Bounds}];
 expect(orderBoards(boards,'index').map(o=>o.index)).toEqual([0,1,2,3]);
 expect(orderBoards(boards,'snake').map(o=>o.index)).toEqual([0,2,1,3]);
 expect(orderBoards(boards,'vertical').map(o=>o.index)).toEqual([0,3,2,1]);
});
it('distributes specific edges instead of centers and supports decimal or negative gaps',()=>{
 const items=[object('a',[0,0,10,10]),object('b',[40,0,60,10]),object('c',[100,0,130,10])];
 expect(distributeEditorObjects(items,'horizontal','end').map(o=>o.bounds[2])).toEqual([10,70,130]);
 expect(distributeEditorObjects(items,'horizontal','start').map(o=>o.bounds[0])).toEqual([0,50,100]);
 expect(distributeEditorObjects(items,'horizontal','gaps',-2).map(o=>o.bounds[0])).toEqual([0,8,26]);
 expect(distributeEditorObjects(items,'horizontal','gaps',1.2345)[1]?.bounds[0]).toBeCloseTo(11.2345,4);
});
it('independent width and height accept four decimal places and width proportional retains aspect',()=>{
 const items=[object('a',[0,0,10,20])];
 expect(resizeEditorObjects(items,12.3456,23.4567,false,false)[0]?.bounds).toEqual([expect.closeTo(-1.1728,8),expect.closeTo(-1.72835,8),expect.closeTo(11.1728,8),expect.closeTo(21.72835,8)]);
 expect(resizeEditorObjects(items,12.3456,undefined,true,false)[0]?.bounds).toEqual([expect.closeTo(-1.1728,8),expect.closeTo(-2.3456,8),expect.closeTo(11.1728,8),expect.closeTo(22.3456,8)]);
});
