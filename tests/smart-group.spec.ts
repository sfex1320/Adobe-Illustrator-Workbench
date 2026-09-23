import {expect,it} from 'vitest';
import {smartGroupComponents} from '@aiq/core';
import type {GroupRegion} from '@aiq/contracts';
const box=(x:number,y:number,w:number,h:number):GroupRegion=>({rings:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]]});
it('groups connected intersections and preserves isolated objects and edge-only contact',()=>{
 expect(smartGroupComponents([box(0,0,10,10),box(9,0,10,10),box(18,0,10,10),box(40,0,10,10),box(50,0,10,10)])).toEqual([[0,1,2]]);
});
it('clips content before testing and does not group across empty parts of a group',()=>{
 const clipped={children:[box(0,0,100,100)],clip:box(0,0,10,10)};
 expect(smartGroupComponents([clipped,box(80,80,10,10)])).toEqual([]);
 expect(smartGroupComponents([clipped,box(8,8,10,10)])).toEqual([[0,1]]);
 expect(smartGroupComponents([{children:[box(0,0,10,10),box(50,0,10,10)]},box(20,0,10,10)])).toEqual([]);
});
it('uses polygon intersection rather than bounding-box overlap and respects compound holes',()=>{
 const triangle={rings:[[[0,0],[10,0],[0,10]]]} as GroupRegion;
 expect(smartGroupComponents([triangle,box(8,8,1,1)])).toEqual([]);
 const ring={rings:[...box(0,0,100,100).rings!,box(20,20,60,60).rings![0]!.slice().reverse()]};
 expect(smartGroupComponents([ring,box(30,30,10,10)])).toEqual([]);
 expect(smartGroupComponents([{...ring,evenodd:true},box(30,30,10,10)])).toEqual([]);
});
it('handles open strokes without treating the hollow interior as painted',()=>{
 const stroke:GroupRegion={stroke:{points:[[0,0],[100,0]],width:10,closed:false,cap:'butt',join:'miter',miterLimit:4}};
 expect(smartGroupComponents([stroke,box(10,4,10,10)])).toEqual([[0,1]]);
 expect(smartGroupComponents([stroke,box(10,6,10,10)])).toEqual([]);
 const outline:GroupRegion={stroke:{...stroke.stroke!,points:[[0,0],[100,0],[100,100],[0,100]],closed:true}};
 expect(smartGroupComponents([outline,box(30,30,10,10)])).toEqual([]);
});
