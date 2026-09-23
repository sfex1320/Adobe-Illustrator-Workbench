import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
it('preserves native selection and delegates ordinary unobserved multi-selection to native alignment',()=>{
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {align:nativeAlign};'),c);
 vm.runInContext(`var called=[],app={version:'30.0.0',executeMenuCommand:function(c){called.push(c);},redraw:function(){}};var d={},refs=[{item:{}},{item:{}}];`,c);
 const r=vm.runInContext("AIQ.align(d,refs,{axes:['bottom'],clip:'frame',text:'frame'})",c);
 expect(r.status).toBe('completed');
 expect(vm.runInContext('called',c)).toEqual(['Vertical Align Bottom']);
});
