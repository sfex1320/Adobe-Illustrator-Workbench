import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function placement(position:string,offset=5){
 const start=source.indexOf('    function artboardLabelPosition('),end=source.indexOf('\n    function ',start+10);
 if(start<0)throw Error('Missing artboard label placement');
 const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
 return Array.from(vm.runInContext(`artboardLabelPosition([10,210,310,10],80,40,'${position}',${offset})`,context));
}
it.each([['top-center',[120,255]],['bottom-center',[120,5]],['left-center',[-75,130]],['right-center',[315,130]],['top-left',[10,255]],['top-right',[230,255]],['bottom-left',[10,5]],['bottom-right',[230,5]]] as const)('positions %s at the expected edge', (position,want)=>expect(placement(position)).toEqual(want));
it('allows a negative inset and rejects unknown positions',()=>{
 expect(placement('top-center',-5)).toEqual([120,245]);expect(()=>placement('middle')).toThrow();
});
