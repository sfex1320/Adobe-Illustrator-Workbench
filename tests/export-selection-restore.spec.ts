import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
it('does not rewrite unchanged selection but restores a changed selection',()=>{
 const context=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {restore:restoreDeliverySelection};'),context);
 vm.runInContext('var item={},other={},original=[item],current=[item],writes=0;var doc={get selection(){return current.slice();},set selection(v){writes++;current=v;}};AIQ.restore(doc,original);',context);
 expect(vm.runInContext('writes',context)).toBe(0);
 vm.runInContext('current=[other];AIQ.restore(doc,original);',context);
 expect(vm.runInContext('writes===1&&current[0]===item',context)).toBe(true);
});
