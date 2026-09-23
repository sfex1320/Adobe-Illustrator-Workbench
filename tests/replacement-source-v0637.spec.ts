import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function sample(){
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};',`return {signature:function(item){return typeof replacementSourceSignature==='function'?replacementSourceSignature(item):editSignature(item);}};`),c);
 vm.runInContext(`var doc={typename:'Document'},parent={typename:'Layer',visible:true,locked:false,parent:doc},item={typename:'PathItem',name:'source',parent:parent,hidden:false,locked:false,opacity:100,geometricBounds:[0,20,10,0],filled:false,stroked:false,strokeWidth:0,closed:true,pathPoints:[{anchor:[0,0],leftDirection:[0,0],rightDirection:[0,0]}]};var before=AIQ.signature(item);`,c);
 return (change:string)=>vm.runInContext(change+';AIQ.signature(item)===before',c);
}
it('retained read-only source remains valid under the isolation ancestor lock',()=>{
 expect(sample()('parent.parent={typename:"Layer",parent:doc,visible:true,locked:true};')).toBe(true);
});
it.each(['item.pathPoints[0].anchor=[1,0]','item.opacity=50','item.locked=true','item.hidden=true','item.geometricBounds=[0,30,10,0]'])('invalidates an actually changed source: %s',change=>{
 expect(sample()(change)).toBe(false);
});
