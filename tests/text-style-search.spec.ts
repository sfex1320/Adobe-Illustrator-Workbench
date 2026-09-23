import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it} from 'vitest';

const source=readFileSync('host/cep/com.aiq.workbench/hostscript.jsx','utf8');
function fixture(){
 const c=vm.createContext({});
 vm.runInContext(source.replace('return {handle:handle,stringify:stringify,performanceCounts:performanceCounts};','return {search:searchEditorText,style:finderTextStyle,sample:sampleEditorTextStyle};'),c);
 vm.runInContext(`
 var fonts=[{typename:'TextFont',name:'A-Regular',family:'A',style:'Regular'},{typename:'TextFont',name:'A-Bold',family:'A',style:'Bold'},{typename:'TextFont',name:'B-Regular',family:'B',style:'Regular'},{typename:'TextFont',name:'B-Bold',family:'B',style:'Bold'}];
 fonts.getByName=function(n){for(var i=0;i<this.length;i++)if(this[i].name===n)return this[i];throw Error('missing font');};
 var red={typename:'RGBColor',red:255,green:0,blue:0},blue={typename:'RGBColor',red:0,green:0,blue:255},none={typename:'NoColor'};
 var records='aabb'.split('').map(function(s,i){return {contents:s,characterAttributes:{textFont:fonts[i===1?1:0],size:12,tracking:7,leading:15,fillColor:i<2?red:blue,strokeColor:none,strokeWeight:0}};});
 function range(start,end){var r={start:start,end:end,length:end-start};Object.defineProperty(r,'characters',{get:function(){var a=[];for(var j=0;j<r.length;j++)a.push(range(start+j,start+j+1));return a;}});Object.defineProperty(r,'contents',{get:function(){return records.slice(start,start+r.length).map(function(x){return x.contents;}).join('');},set:function(v){throw Error('full contents write forbidden in style replacement');}});Object.defineProperty(r,'characterAttributes',{get:function(){return records[start].characterAttributes;}});return r;}
 var doc={typename:'Document',selection:[],views:[{}]},frame={typename:'TextFrame',uuid:'frame',name:'',parent:doc,geometricBounds:[0,100,100,0],textRange:range(0,4)};
 var story={textFrames:[frame],textRange:range(0,4)};frame.story=story;doc.textFrames=[frame];
 var app={textFonts:fonts,redraw:function(){}};
 function RGBColor(){this.typename='RGBColor';}function CMYKColor(){this.typename='CMYKColor';}function GrayColor(){this.typename='GrayColor';}function NoColor(){this.typename='NoColor';}function SpotColor(){this.typename='SpotColor';}
 var request={scope:'document',operation:'find',query:'',textFill:{kind:'rgb',values:[255,0,0]},matchCase:true};
 function find(){return AIQ.search(doc,'doc',null,request);}
 function replace(fields){var found=find();var a={};for(var k in request)a[k]=request[k];for(var p in fields)a[p]=fields[p];a.operation='replace-style';a.searchToken=found.searchToken;return AIQ.search(doc,'doc',null,a);}
 `,c);
 return c;
}
const run=(c:vm.Context,s:string)=>vm.runInContext(s,c);
it('intersects literal text with font, style, size and exact fill without merging RGB and CMYK',()=>{
 const c=fixture();run(c,"request.query='a';request.font='A';request.fontStyle='Regular';request.fontSize=12");
 expect(run(c,'find().matchCount')).toBe(1);
 run(c,"request.textFill={kind:'cmyk',values:[0,100,100,0]}");expect(run(c,'find().matchCount')).toBe(0);
});
it('changes only requested fill and size on matching characters and preserves mixed fonts and other characters',()=>{
 const c=fixture();expect(run(c,"replace({replacementSize:24,replacementFill:{kind:'cmyk',values:[0,0,0,100]}}).status")).toBe('completed');
 expect(run(c,'records.map(function(x){return [x.characterAttributes.textFont.name,x.characterAttributes.size,x.characterAttributes.fillColor.typename,x.characterAttributes.tracking];})')).toEqual([['A-Regular',24,'CMYKColor',7],['A-Bold',24,'CMYKColor',7],['A-Regular',12,'RGBColor',7],['A-Regular',12,'RGBColor',7]]);
 expect(run(c,'doc.selection')).toEqual([]);
});
it('family-only replacement preserves each character style, and style-only keeps family',()=>{
 const c=fixture();expect(run(c,"replace({replacementFamily:'B'}).status")).toBe('completed');
 expect(run(c,'records.map(function(x){return x.characterAttributes.textFont.name;})')).toEqual(['B-Regular','B-Bold','A-Regular','A-Regular']);
 expect(run(c,"replace({replacementStyle:'Regular'}).status")).toBe('completed');
 expect(run(c,'records[1].characterAttributes.textFont.name')).toBe('B-Regular');
});
it('preflights every required font style before writing any characters',()=>{
 const c=fixture();run(c,'fonts.splice(3,1)');expect(()=>run(c,"replace({replacementFamily:'B',replacementSize:24})")).toThrow('款式');
 expect(run(c,'records.map(function(x){return x.characterAttributes.size;})')).toEqual([12,12,12,12]);
});
it('rejects stale colors, changed conditions, empty selection, unsupported fills and empty replacements',()=>{
 const c=fixture();run(c,"var old=find();request.operation='replace-style';request.searchToken=old.searchToken;request.replacementSize=24;records[0].characterAttributes.fillColor=blue");
 expect(()=>run(c,"AIQ.search(doc,'doc',null,request)")).toThrow('样式已变化');
 run(c,"request.operation='find';request.scope='selection'");expect(()=>run(c,'find()')).toThrow('空选区');
 run(c,"request.scope='document';request.textFill={kind:'gradient',name:'G'}");expect(()=>run(c,'find()')).toThrow('填色');
 run(c,"request.textFill={kind:'rgb',values:[0,0,255]};delete request.replacementSize");expect(()=>run(c,'replace({})')).toThrow('替换');
});
it('spot matches include name, tint and base color and never match their RGB preview',()=>{
 const c=fixture();run(c,"records[0].characterAttributes.fillColor={typename:'SpotColor',spot:{name:'Brand',color:red},tint:50};request.textFill={kind:'spot',name:'Brand',tint:50,base:{kind:'rgb',values:[255,0,0]}};");
 expect(run(c,'find().matchCount')).toBe(1);
 run(c,'request.textFill.tint=100');expect(run(c,'find().matchCount')).toBe(0);
 run(c,"request.textFill={kind:'rgb',values:[255,128,128]}");expect(run(c,'find().matchCount')).toBe(0);
});
it('reports partial side effects and invalidates search when a later character write fails',()=>{
 const c=fixture();run(c,"Object.defineProperty(records[1].characterAttributes,'size',{get:function(){return 12;},set:function(){throw Error('write denied');}})");
 expect(run(c,'replace({replacementSize:24})')).toMatchObject({status:'failed',sideEffects:['partial-write']});
 expect(run(c,'records[0].characterAttributes.size')).toBe(24);
});
it('samples only requested attributes, rejects mixed fills and preserves exact spot identity',()=>{
 const c=fixture();run(c,"doc.selection=range(0,2);doc.selection.typename='TextRange';");
 expect(()=>run(c,'AIQ.sample(doc,{})')).toThrow('混合');
 expect(run(c,"AIQ.sample(doc,{fields:['fill']}).textSample")).toEqual({fill:{kind:'rgb',values:[255,0,0]}});
 run(c,'records[1].characterAttributes.fillColor=blue');expect(()=>run(c,"AIQ.sample(doc,{fields:['fill']})")).toThrow('混合');
 run(c,"doc.selection=range(0,1);doc.selection.typename='TextRange';records[0].characterAttributes.fillColor={typename:'SpotColor',spot:{name:'Brand',color:red},tint:25}");
 expect(run(c,"AIQ.sample(doc,{fields:['fill']}).textSample.fill")).toEqual({kind:'spot',name:'Brand',tint:25,base:{kind:'rgb',values:[255,0,0]}});
 run(c,"records[0].characterAttributes.fillColor={typename:'GradientColor',gradient:{name:'G'}}");expect(()=>run(c,"AIQ.sample(doc,{fields:['fill']})")).toThrow('暂不支持');
});
it('replaces with the existing document spot and rejects missing or changed spot definitions before any size write',()=>{
 const c=fixture();run(c,"doc.spots=[{name:'Brand',color:red}];var desired={kind:'spot',name:'Brand',tint:50,base:{kind:'rgb',values:[255,0,0]}};");
 expect(run(c,'replace({replacementFill:desired}).status')).toBe('completed');
 expect(run(c,'records[0].characterAttributes.fillColor.spot===doc.spots[0]')).toBe(true);
 run(c,"request.textFill=desired;doc.spots[0].color=blue;request.textFill.base={kind:'rgb',values:[0,0,255]};desired={kind:'spot',name:'Brand',tint:50,base:{kind:'rgb',values:[255,0,0]}};");
 expect(()=>run(c,'replace({replacementFill:desired,replacementSize:24})')).toThrow('专色已变化');
 expect(run(c,'records[0].characterAttributes.size')).toBe(12);
});
it('checked occurrence replacements retain neighboring hits and changing document or query invalidates tokens',()=>{
 const c=fixture();run(c,"request.query='a';var found=find();var action={scope:'document',query:'a',matchCase:true,textFill:request.textFill,operation:'replace-style',replacementSize:24,searchToken:found.searchToken,matchIndexes:[1]};");
 expect(()=>run(c,"AIQ.search(doc,'other',null,action)")).toThrow('过期');
 run(c,"action.textFill={kind:'rgb',values:[0,0,255]}");expect(()=>run(c,"AIQ.search(doc,'doc',null,action)")).toThrow('过期');
 run(c,'action.textFill=request.textFill');expect(run(c,"AIQ.search(doc,'doc',null,action).status")).toBe('completed');
 expect(run(c,'records.map(function(x){return x.characterAttributes.size;})')).toEqual([12,24,12,12]);
});
it('protected threaded text is skipped and absent exact color identity never satisfies a fill filter',()=>{
 const c=fixture();run(c,"story.textFrames.push({hidden:true,parent:doc})");expect(run(c,'find()')).toMatchObject({status:'partial',matchCount:0});
 const d=fixture();run(d,"records[0].characterAttributes.fillColor={typename:'GradientColor',gradient:{name:'G'}};request.query='a';");expect(run(d,'find().matchCount')).toBe(1);
});
