import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';
const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
it('closed native document references are rejected before comparing against live documents',()=>{
 const declaration=source.match(/ {4}function variableOpen\(doc\)\{[^\n]+/);if(!declaration)throw Error('Missing variableOpen');
 const closed=Object.defineProperty({},'name',{get(){throw Error('Object invalid');}}),live={name:'open.ai'};
 const context=vm.createContext({closed,live,app:{documents:[closed,live]}});vm.runInContext(declaration[0],context);
 expect(vm.runInContext('variableOpen(closed)',context)).toBe(false);
 expect(vm.runInContext('variableOpen(live)',context)).toBe(true);
});
function fn(name:string,next:string){const start=source.indexOf('    function '+name+'('),end=source.indexOf('    function '+next+'(',start);if(start<0||end<0)throw Error('Missing '+name);return source.slice(start,end);}
it('image replacement keeps the target blend mode when moving its appearance onto a new group',()=>{
 const c=vm.createContext({});vm.runInContext(`
 var target={typename:'PathItem',geometricBounds:[0,100,100,0],opacity:65,blendingMode:'MULTIPLY',remove:function(){this.removed=true;}};
 var group={opacity:100,blendingMode:'NORMAL'},placed={move:function(){},embed:function(){}},output={placedItems:{add:function(){return placed;}}};
 function productivityRect(){return true;}function variableBoxGroup(){return {group:group,box:[0,0,100,100]};}function bounds(){return [0,0,100,100];}
 function File(){this.exists=true;this.name='photo.png';}function variableFitGraphic(){}function duplicatePosition(){return {zOrder:function(){}};}
 var ElementPlacement={PLACEATEND:1,PLACEATBEGINNING:0},ZOrderMethod={BRINGTOFRONT:1};
 `+fn('variableGraphic','variableQr'),c);
 const result=vm.runInContext("variableGraphic({},target,{kind:'image',fit:'contain'},{text:'photo.png'},output)",c);
 expect(result.opacity).toBe(65);expect(result.blendingMode).toBe('MULTIPLY');
});
it('whole-frame template replacement refuses tracking mixtures before collapsing character styles',()=>{
 const c=vm.createContext({});vm.runInContext(`
 var base={textFont:{name:'Font'},size:12,fillColor:'black',strokeColor:'none',strokeWeight:0,tracking:0};
 var records=[{contents:'A',characterAttributes:Object.assign({},base)},{contents:'B',characterAttributes:Object.assign({},base,{tracking:100})}];
 var frame={typename:'TextFrame',contents:'AB',characters:records};
 function color(c){return c;}function stringify(v){return JSON.stringify(v);}
 function variableRange(){var range={characters:records};Object.defineProperty(range,'contents',{set:function(value){frame.contents=value;}});range.characterAttributes=new Proxy({}, {set:function(_,key,value){records.forEach(function(c){c.characterAttributes[key]=value;});return true;}});return {range:range};}
 function setCharacterValue(out,range,key,value){range.characterAttributes[key]=value;}
 `+fn('fontAttributes','editSignature')+fn('variableText','variableFits'),c);
 expect(()=>vm.runInContext("variableText(frame,{placeholder:'',style:'template'},{text:'CD'}, {}, {})",c)).toThrow('混合样式');
 expect(vm.runInContext('records.map(function(c){return c.characterAttributes.tracking;})',c)).toEqual([0,100]);
});
