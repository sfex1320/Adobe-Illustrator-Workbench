import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function fixture(){
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};',`return {edit:editDocument,prime:function(d,g){var sid=session(d);editorTokens=[{token:'test',sid:sid,refs:[{item:g,parent:g.parent,stamp:displayStamp(g)}]}];return sid;}};`),c);
 vm.runInContext(`var d={typename:'Document'},layer={typename:'Layer',parent:d,visible:true,locked:false},g={typename:'GroupItem',parent:layer,clipped:false,hidden:false,locked:false,geometricBounds:[0,100,100,0],resize:function(x,y){this.geometricBounds=[50-x/2,50+y/2,50+x/2,50-y/2];},translate:function(x,y){var b=this.geometricBounds;this.geometricBounds=[b[0]+x,b[1]+y,b[2]+x,b[3]+y];}};
Object.defineProperty(g,'pageItems',{get:function(){throw Error('Geometry must not traverse descendants');}});
d.selection=[g];var app={activeDocument:d,documents:[d],redraw:function(){}},Transformation={CENTER:0},sid=AIQ.prime(d,g);
var request={docSessionId:sid,token:'test',action:{type:'geometry',transforms:[{id:'s0',bounds:[-50,-150,150,50]}]}};`,c);
 return {run:(code='')=>vm.runInContext(code+';AIQ.edit(request)',c),bounds:()=>vm.runInContext('g.geometricBounds',c)};
}
it('resizes a group using root validation without reading descendant paths or text',()=>{
 const f=fixture();expect(f.run()).toMatchObject({status:'completed'});expect(f.bounds()).toEqual([-50,150,150,-50]);
});
it.each(['g.parent={typename:"Layer",parent:d,visible:true};','g.locked=true;','g.geometricBounds=[0,200,100,0];','d.selection=[];'])('rejects stale or protected geometry before resizing: %s',code=>{
 const f=fixture();expect(f.run(code)).toMatchObject({status:'failed',sideEffects:[]});
});
