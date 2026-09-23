import { describe,it,expect } from 'vitest';
import { overallBounds,centeredBounds,resizeEditorObjects,distributeEditorObjects } from '@aiq/core';
import type { Bounds,EditorObject } from '@aiq/contracts';
function object(id:string,bounds:Bounds):EditorObject{return {id,bounds,kind:'path',fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null};}
describe('Editor sizing and distribution semantics',()=>{
 it('measures one object or the union of multiple objects',()=>{const a=object('a',[10,20,40,50]),b=object('b',[60,80,100,120]);expect(overallBounds([a])).toEqual(a.bounds);expect(overallBounds([a,b])).toEqual([10,20,100,120]);});
 it('scales selection geometry and gaps as a whole',()=>{expect(resizeEditorObjects([object('a',[10,20,30,40]),object('b',[50,60,70,80])],120,undefined,true,true)).toEqual([{id:'a',bounds:[-20,-10,20,30]},{id:'b',bounds:[60,70,100,110]}]);});
 it('uniform width scales each item independently and preserves their centers',()=>{expect(resizeEditorObjects([object('a',[0,0,20,10]),object('b',[50,50,90,90])],80,undefined,true,false)).toEqual([{id:'a',bounds:[-30,-15,50,25]},{id:'b',bounds:[30,30,110,110]}]);});
 it('gap distribution differs from center distribution with unequal sizes',()=>{const items=[object('a',[0,0,10,10]),object('b',[20,0,50,10]),object('c',[100,0,120,10])];expect(distributeEditorObjects(items,'horizontal','gaps')[1]!.bounds).toEqual([40,0,70,10]);expect(distributeEditorObjects(items,'horizontal','centers')[1]!.bounds).toEqual([42.5,0,72.5,10]);});
 it('vertical gaps use object edges and preserve endpoints',()=>{const items=[object('a',[0,0,10,10]),object('b',[0,20,10,50]),object('c',[0,100,10,120])];expect(distributeEditorObjects(items,'vertical','gaps').map(t=>t.bounds)).toEqual([[0,0,10,10],[0,40,10,70],[0,100,10,120]]);});
 it('empty, degenerate and invalid input never imply full document operations',()=>{expect(()=>overallBounds([])).toThrow();expect(()=>resizeEditorObjects([object('a',[0,0,0,10])],5,undefined,true,false)).toThrow();expect(()=>resizeEditorObjects([object('a',[0,0,10,10])],-5,undefined,true,false)).toThrow();expect(()=>distributeEditorObjects([],'horizontal','gaps')).toThrow();});
});

it('artboard resize preserves its center for growth and shrink',()=>{expect(centeredBounds([100,-300,400,-100],600,80)).toEqual([-50,-240,550,-160]);expect(()=>centeredBounds([0,0,100,100],0,50)).toThrow();});
it('whole selection shrink preserves center and scales gaps',()=>{const items=[object('a',[-20,-10,20,30]),object('b',[60,70,100,110])];expect(resizeEditorObjects(items,60,undefined,true,true).map(o=>o.bounds)).toEqual([[10,20,30,40],[50,60,70,80]]);});
