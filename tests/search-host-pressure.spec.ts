import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function fixture(){
 const context=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {search:searchEditorObjects};'),context);
 vm.runInContext("var accesses=0,lengthReads=0,doc={typename:'Document',selection:[],pageItems:{get length(){lengthReads++;return 29316;},get 0(){accesses++;throw Error('Expensive item access');}}};var request={scope:'document',operation:'find',same:[],excludeGroups:true,tolerance:0.01,width:20,sizeCompare:'greater'};",context);
 return context;
}
it('rejects an over-limit document before traversing expensive host items',()=>{
 const context=fixture();expect(()=>vm.runInContext("AIQ.search(doc,'d',request)",context)).toThrow('20000');
 expect(vm.runInContext('[accesses,lengthReads]',context)).toEqual([0,1]);
});
it('empty explicit selection never scans the large document',()=>{
 const context=fixture();vm.runInContext("request.scope='selection'",context);
 expect(()=>vm.runInContext("AIQ.search(doc,'d',request)",context)).toThrow('空选区');
 expect(vm.runInContext('[accesses,lengthReads]',context)).toEqual([0,0]);
});
it('unreadable font identity permits content search but never satisfies a font filter',()=>{
 const context=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {style:finderTextStyle};'),context);
 vm.runInContext("var ca={get textFont(){throw Error('UKFG');},size:18,tracking:0,leading:21,fillColor:{typename:'NoColor'},strokeColor:{typename:'NoColor'}};var range={characters:[{characterAttributes:ca}]};",context);
 expect(vm.runInContext('AIQ.style(range,{})',context)).toMatchObject({ok:true,unresolved:true});
 expect(vm.runInContext("AIQ.style(range,{font:'MissingFont'})",context)).toMatchObject({ok:false,unresolved:true});
 expect(vm.runInContext("AIQ.style(range,{fontStyle:'Bold'})",context)).toMatchObject({ok:false,unresolved:true});
 expect(vm.runInContext('AIQ.style(range,{fontSize:18})',context)).toMatchObject({ok:true,unresolved:true});
});
