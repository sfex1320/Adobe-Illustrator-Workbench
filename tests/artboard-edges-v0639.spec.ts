import {expect,it} from 'vitest';
import {adjustArtboardEdges} from '../packages/core/src/artboard-edges.js';
it('expands independent sides in document coordinates without moving artwork',()=>{
 expect(adjustArtboardEdges([100,200,300,400],[10,20,30,40])).toEqual([90,180,330,440]);
 expect(adjustArtboardEdges([100,200,300,400],[-10,-20,-30,-40])).toEqual([110,220,270,360]);
});
it('rejects empty dimensions, incomplete values and non-finite drafts',()=>{
 for(const values of [[100,0,-300,0],[1,2,3],[NaN,0,0,0]])expect(()=>adjustArtboardEdges([0,0,100,100],values)).toThrow();
});
