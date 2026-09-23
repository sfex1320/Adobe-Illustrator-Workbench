import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function readFunction(name:string,next:string){const start=source.indexOf('    function '+name+'('),end=source.indexOf('    function '+next+'(',start);if(start<0||end<0)throw Error('缺少宿主函数 '+name);return source.slice(start,end);}
it('reads selected root stacking hierarchy without traversing siblings or artwork',()=>{
 const document={typename:'Document'},layer={typename:'Layer',zOrderPosition:2,parent:document},group={typename:'GroupItem',zOrderPosition:5,parent:layer},item={typename:'PathItem',zOrderPosition:7,parent:group};
 const context=vm.createContext({});vm.runInContext(readFunction('editorStackOrder','readEditor'),context);
 expect(context.editorStackOrder(item)).toEqual([2,5,7]);
 const bad={typename:'PathItem',parent:layer,get zOrderPosition(){throw Error('unsupported');}};
 expect(context.editorStackOrder(bad)).toBeNull();
});
it('keeps default geometry stroke width and scales it only for explicit arrangement requests',()=>{
 const base={bounds:[0,0,10,20],typename:'PathItem',stroked:true,strokeWidth:3};
 const context=vm.createContext({editorBounds:(o:typeof base)=>o.bounds,positive:(n:number)=>n,pathGeometry:()=>({points:[{anchor:[0,0],left:[0,0],right:[0,0]}]}),setGeometry:vi.fn(),Transformation:{CENTER:0}});
 vm.runInContext(readFunction('setItemBounds','straightConvex'),context);
 const normal={...base};context.setItemBounds(normal,[0,0,20,40]);expect(normal.strokeWidth).toBe(3);
 const proportional={...base};context.setItemBounds(proportional,[0,0,20,40],true);expect(proportional.strokeWidth).toBe(6);
 const group={...base,typename:'GroupItem',resize:vi.fn(),translate:vi.fn()};context.setItemBounds(group,[0,0,20,40],true);expect(group.resize).toHaveBeenCalledWith(200,200,true,true,true,true,200,0);
 const unchanged={...group,resize:vi.fn()};context.setItemBounds(unchanged,[0,0,20,40]);expect(unchanged.resize).toHaveBeenCalledWith(200,200,true,true,true,true,100,0);
});
