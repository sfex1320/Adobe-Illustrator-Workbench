import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
describe('Large read-only collection traversal',()=>{
 it('plans complete nested groups with a bounded number of native count reads',()=>{
  let lengthReads=0;const collection=(items:unknown[])=>new Proxy(items,{get(target,key){if(key==='length')lengthReads++;return Reflect.get(target,key);}});
  const layer:{pageItems:unknown[];layers:unknown[];typename:string}={pageItems:[],layers:[],typename:'Layer'};
  const group:{typename:string;parent:unknown;pageItems:unknown[]}={typename:'GroupItem',parent:layer,pageItems:[]};
  const children=Array.from({length:2000},()=>({typename:'PathItem',parent:group,visibleBounds:[0,10,10,0]}));
  group.pageItems=collection(children);layer.pageItems=collection([group,...children]);layer.layers=[];
  const context=vm.createContext({});
  vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {plan:planDeliveryLayers};'),context);
  const plan=context.AIQ.plan({layers:[layer]},[[0,10,10,0]],5000);
  expect(plan.objectCount).toBe(2001);expect(plan.layers[0].items).toEqual([group]);
  expect(lengthReads).toBeLessThan(10);
  expect(()=>context.AIQ.plan({layers:[layer]},[[0,10,10,0]],1000)).toThrow(/超过/);
 });
 it('preserves every anchor and handle while reading the path count once',()=>{
  let countReads=0;const points=Array.from({length:3000},(_,i)=>({anchor:[i,1],leftDirection:[i-1,2],rightDirection:[i+1,3]}));
  const nativePoints=new Proxy(points,{get(target,key){if(key==='length')countReads++;return Reflect.get(target,key);}});
  const context=vm.createContext({});vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {geometry:pathGeometry};'),context);
  const r=context.AIQ.geometry({closed:true,pathPoints:nativePoints});
  expect(r.points).toHaveLength(3000);expect(r.points[2999]).toEqual({anchor:[2999,1],left:[2998,2],right:[3000,3]});expect(countReads).toBe(1);
 });
});
