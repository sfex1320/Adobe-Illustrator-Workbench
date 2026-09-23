import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';

const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function context(){
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {rect:productivityRect,order:productivityOrder,edit:productivityEdit};'),c);
 return c;
}
it('recognizes TextPath rectangles without unsupported geometricBounds, rejects crossed and curved paths',()=>{
 const c=context();
 vm.runInContext(`function path(a){return {closed:true,pathPoints:a.map(function(v){return {anchor:v,leftDirection:v,rightDirection:v};})};}var rectangle=path([[0,100],[80,100],[80,20],[0,20]]);`,c);
 expect(vm.runInContext('AIQ.rect(rectangle)',c)).toBe(true);
 expect(vm.runInContext('AIQ.rect(path([[0,100],[80,20],[80,100],[0,20]]))',c)).toBe(false);
 expect(vm.runInContext('AIQ.rect(path([[0,100],[40,120],[80,100],[0,20]]))',c)).toBe(false);
 vm.runInContext('rectangle.pathPoints[0].rightDirection=[10,90]',c);
 expect(vm.runInContext('AIQ.rect(rectangle)',c)).toBe(false);
});
it('orders shuffled rows and columns by reading position rather than host enumeration',()=>{
 const c=context();
 vm.runInContext(`var items=[{name:'D',geometricBounds:[100,50,120,30]},{name:'B',geometricBounds:[100,100,120,80]},{name:'C',geometricBounds:[0,50,20,30]},{name:'A',geometricBounds:[0,100,20,80]}];`,c);
 expect(vm.runInContext("AIQ.order(items,'rows',3).map(function(i){return i.name;})",c)).toEqual(['A','B','C','D']);
 expect(vm.runInContext("AIQ.order(items,'columns',3).map(function(i){return i.name;})",c)).toEqual(['A','C','B','D']);
});
it('does not claim Photoshop opened a file without target acknowledgement',()=>{
 const c=context();
 vm.runInContext(`var app={redraw:function(){}},files=[{item:{typename:'PlacedItem',file:{exists:true,name:'fixture.png',fsName:'fixture.png'}}}];function BridgeTalk(){}BridgeTalk.getSpecifier=function(){return 'photoshop-27.0';};BridgeTalk.prototype.send=function(){return true;};`,c);
 expect(()=>vm.runInContext("AIQ.edit({},'d',files,{operation:'photoshop',mode:'open'})",c)).toThrow('尚未收到');
 vm.runInContext("BridgeTalk.prototype.send=function(){this.onError({body:'private path'});return true;};",c);
 expect(()=>vm.runInContext("AIQ.edit({},'d',files,{operation:'photoshop',mode:'open'})",c)).toThrow('Photoshop 打开图片失败');
 vm.runInContext("BridgeTalk.prototype.send=function(){this.onResult({body:'AIQ_OPENED:1'});return true;};",c);
 expect(vm.runInContext("AIQ.edit({},'d',files,{operation:'photoshop',mode:'open'}).status",c)).toBe('completed');
});

it.each([['width',100,50],['height',200,100],['stretch',100,100]])('fits mask %s without changing mask or content organization',(mode,width,height)=>{
 const c=context();
 vm.runInContext(`var app={redraw:function(){}},Transformation={CENTER:0};
 var mask={typename:'PathItem',clipping:true,geometricBounds:[0,100,100,0]};
 var content={typename:'RasterItem',geometricBounds:[0,100,200,0],resize:function(x,y){this.geometricBounds=[0,100,200*x/100,100-y];},translate:function(){}};
 var group={typename:'GroupItem',clipped:true,pageItems:[mask,content]};mask.parent=content.parent=group;`,c);
 const result=vm.runInContext(`AIQ.edit({},'d',[{item:group}],{operation:'mask-fit',mode:'${mode}',anchorX:.5,anchorY:.5,dx:0,dy:0})`,c);
 expect(result.status).toBe('completed');
 expect(vm.runInContext('content.geometricBounds[2]',c)).toBe(width);
 expect(vm.runInContext('100-content.geometricBounds[3]',c)).toBe(height);
 expect(vm.runInContext('mask.geometricBounds',c)).toEqual([0,100,100,0]);
});
