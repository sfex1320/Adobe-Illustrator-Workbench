import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function run(command:string,count=2){
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {run:runNative};'),c);
 return vm.runInContext(`var calls=[],parent={typename:'Layer'},a={typename:'PathItem',parent:parent},b={typename:'PathItem',parent:parent},d={selection:[a,b]},g={typename:'GroupItem',clipped:true,parent:parent};parent.pageItems=[b,a];var refs=${count===0?'[]':command==='mask-release'?'[{item:g}]':count===1?'[{item:a}]':'[{item:a},{item:b}]'};var app={version:'30.0.0',redraw:function(){},executeMenuCommand:function(name){calls.push(name);if(name==='makeMask')d.selection=[g];if(name==='releaseMask')g.clipped=false;}};var result;try{result=AIQ.run(d,refs,{command:${JSON.stringify(command)}});}catch(e){result={error:String(e)};}({result:result,calls:calls});`,c);
}
it('creates a mask through the verified native command',()=>expect(run('mask-create')).toMatchObject({result:{status:'completed'},calls:['makeMask']}));
it('releases a selected clipping group',()=>expect(run('mask-release')).toMatchObject({result:{status:'completed'},calls:['releaseMask']}));
it.each([0,1])('refuses insufficient mask creation selection (%s) without dispatch',count=>expect(run('mask-create',count).calls).toEqual([]));
