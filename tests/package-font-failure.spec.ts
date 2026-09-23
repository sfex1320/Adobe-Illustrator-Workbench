import {expect,it} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

it('continues collecting valid font runs when a native font getter throws, with explicit incomplete coverage',()=>{
 const source=fs.readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
 const fn=source.slice(source.indexOf('    function packageResources('),source.indexOf('    function collectPackageFonts('));
 const bad={get textFont(){throw Error('UKFG');}},good={textFont:{name:'Known-Regular',family:'Known',style:'Regular'}};
 const doc={stories:[{textRange:{characters:[{characterAttributes:bad,getTextRunLength:()=>1},{characterAttributes:good,getTextRunLength:()=>2}]}}],pathItems:[],pageItems:[],swatches:[]};
 const output=vm.runInNewContext(fn+';packageResources(doc,false)',{doc});
 expect(output.fonts.map((f:{name:string})=>f.name)).toEqual(['Known-Regular']);
 expect(output.fontWarnings).toHaveLength(1);
 expect(output.fontWarnings[0].reason).toContain('未确认收集');
});

it('reports incomplete colors when the resource budget is exceeded instead of silently reporting zero',()=>{
 const source=fs.readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8'),fn=source.slice(source.indexOf('    function packageResources('),source.indexOf('    function collectPackageFonts('));
 let elapsed=0;class Clock {getTime(){elapsed+=5000;return elapsed;}}
 const doc={stories:[],pathItems:Array.from({length:1000},()=>({filled:true,stroked:false,fillColor:{}})),pageItems:Array.from({length:1000},()=>({typename:'PathItem'})),swatches:[]};
 const out=vm.runInNewContext(fn+';packageResources(doc,true)',{doc,Date:Clock,color:()=>({kind:'rgb',colorId:'red'})});
 expect(out.colorWarnings).toHaveLength(2);expect(out.colorWarnings[0].reason).toContain('颜色清单不完整');expect(out.colorWarnings[1].reason).toContain('不能按零');expect(out.colors).toHaveLength(1);
});
