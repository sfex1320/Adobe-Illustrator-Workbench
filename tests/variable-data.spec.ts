import {expect,it} from 'vitest';
import ExcelJS from 'exceljs';
import jsQR from 'jsqr';
import {parseCSV,readTable,workbookTable} from '../packages/modules/variable-data/src/table.js';
import {buildVariablePlan,newBinding,qrMatrix,matchImageFile,variableLayout} from '../packages/modules/variable-data/src/plan.js';
import type {VariableTemplate} from '@aiq/contracts';
const template:VariableTemplate={token:'template',docName:'设计',boardName:'模板',width:300,height:200,objectCount:3,characterStyles:[],graphicStyles:[],targets:[{id:'t0',name:'姓名',kind:'TextFrame',text:'您好〔姓名〕，欢迎来到〔城市〕。',width:200,height:50}]};
it('CSV preserves leading zeros, multiline quoted fields, commas and escaped quotes',()=>{
 expect(parseCSV('\uFEFF编号,介绍\r\n000123,"第一行\n第二行，""特别"""\r\n')).toEqual([['编号','介绍'],['000123','第一行\n第二行，“特别”'.replace('“','"').replace('”','"')]]);
 expect(()=>parseCSV('a,b\n"broken')).toThrow(/引号未闭合/);
});
it('XLSX reads whole-cell and partial bold, formatted numbers, dates and cached formulas',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('数据');s.addRow(['编号','介绍','日期','公式','强调']);
 s.addRow([123,{richText:[{text:'普通',font:{bold:false}},{text:'重点',font:{bold:true}},{text:'恢复',font:{bold:false}}]},new Date('2026-09-13T00:00:00Z'),{formula:'1+2',result:3},'整格粗体']);
 s.getCell('A2').numFmt='000000';s.getCell('C2').numFmt='yyyy-mm-dd';s.getCell('E2').font={bold:true};
 const buffer=await w.xlsx.writeBuffer();const bytes=new Uint8Array(buffer).slice().buffer;const table=await readTable(bytes,'example.xlsx');
 expect(table.rows[0]!.cells.A!.text).toBe('000123');expect(table.rows[0]!.cells.B!.runs.map(r=>r.bold)).toEqual([false,true,false]);
 expect(table.rows[0]!.cells.C!.text).toBe('2026-09-13');expect(table.rows[0]!.cells.D!.text).toBe('3');expect(table.rows[0]!.cells.E!.runs[0]!.bold).toBe(true);
});
it('uncached formula is an explicit cell error, not empty text success',()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('数据');s.addRow(['姓名']);s.addRow([{formula:'A3'}]);
 const table=workbookTable(w);expect(table.rows[0]!.cells.A!.error).toMatch(/没有已保存/);
 const b=newBinding('A','t0','one');expect(buildVariablePlan(table,template,[b],[2],'','').errors[0]!.reason).toMatch(/公式/);
});
it('sheet selection and hidden rows are explicit; merged data is rejected',()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('一');s.addRow(['名']);s.addRow(['a']);s.getRow(2).hidden=true;w.addWorksheet('二').addRows([['名'],['b']]);
 expect(workbookTable(w,'一').rows).toHaveLength(0);expect(workbookTable(w,'一',true).rows).toHaveLength(1);expect(workbookTable(w,'二').rows[0]!.cells.A!.text).toBe('b');
 s.mergeCells('A2:A3');expect(()=>workbookTable(w,'一')).toThrow(/合并/);
});
it('multiple fields in the same frame use distinct placeholders; ambiguous targets fail',()=>{
 const w=new ExcelJS.Workbook();w.addWorksheet('数据').addRows([['姓名','城市'],['张三','北京']]);const table=workbookTable(w);
 const one={...newBinding('A','t0','one'),placeholder:'〔姓名〕'},two={...newBinding('B','t0','two'),placeholder:'〔城市〕'};
 expect(buildVariablePlan(table,template,[one,two],[2],'','').records[0]!.values.map(v=>v.text)).toEqual(['张三','北京']);
 expect(()=>buildVariablePlan(table,template,[one,{...two,placeholder:''}],[2],'','')).toThrow(/不同文字占位符/);
});
it('missing bold mapping blocks only affected rows; fixed font mode deliberately ignores table emphasis',()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('数据');s.addRows([['姓名'],['普通'],['重点']]);s.getCell('A3').font={bold:true};const table=workbookTable(w),b={...newBinding('A','t0','one'),style:'emphasis' as const};
 expect(buildVariablePlan(table,template,[b],[2,3],'','').errors.map(e=>e.row)).toEqual([3]);
 expect(buildVariablePlan(table,template,[{...b,style:'template'}],[2,3],'','').records).toHaveLength(2);
});
it('uses first row by default, supports first-column transpose and keeps rich text',async()=>{
 const csv=new TextEncoder().encode('姓名,张三,李四\n编号,0001,0002\n照片,张三.png,李四.png').buffer;
 const table=await readTable(csv,'people.csv',undefined,false,'utf-8','column');
 expect(table.columns.map(c=>c.label)).toEqual(['A · 姓名','B · 编号','C · 照片']);expect(table.rows.map(r=>[r.row,r.cells.A!.text,r.cells.B!.text])).toEqual([[2,'张三','0001'],[3,'李四','0002']]);
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('数据');s.addRows([['姓名',{richText:[{text:'强调',font:{bold:true}}]},'普通'],['编号','0001','0002']]);
 expect(workbookTable(w,undefined,false,'column').rows[0]!.cells.A!.runs[0]!.bold).toBe(true);
 expect(newBinding('A','t0','id').style).toBe('template');
});
it('matches image filenames independently of directory order and rejects missing or ambiguous stems',()=>{
 const images=['C:/相片/李四.jpg','C:/相片/张三.png','C:/相片/张三.jpg'];
 expect(matchImageFile('李四',images)).toBe(images[0]);expect(matchImageFile('张三.png',images)).toBe(images[1]);
 expect(()=>matchImageFile('张三',images)).toThrow(/多个扩展名/);expect(()=>matchImageFile('无名',images)).toThrow(/找不到/);expect(()=>matchImageFile('../张三.png',images)).toThrow(/不能填写路径/);
 expect(matchImageFile('李四',[...images].reverse())).toBe(images[0]);
});
it('lays out independent rows and columns in horizontal blocks with independent gaps',()=>{
 const layout=variableLayout(template,9,2,2,20,30);
 expect(layout.capacity).toBe(4);expect(layout.positions).toEqual([{left:0,top:-0},{left:320,top:-0},{left:0,top:-230},{left:320,top:-230},{left:640,top:-0},{left:960,top:-0},{left:640,top:-230},{left:960,top:-230},{left:1280,top:-0}]);
 for(let i=0;i<layout.positions.length;i++)for(let j=i+1;j<layout.positions.length;j++){const a=layout.positions[i]!,b=layout.positions[j]!;expect(Math.abs(a.left-b.left)>=template.width||Math.abs(a.top-b.top)>=template.height).toBe(true);}
});
it('rejects negative gaps and insufficient spacing for template bleed objects',()=>{
 expect(()=>variableLayout(template,2,2,1,-1,0)).toThrow(/不能为负/);
 const bleed={...template,artworkWidth:320,artworkHeight:220};
 expect(()=>variableLayout(bleed,5,2,2,10,20)).toThrow(/间距不足/);expect(()=>variableLayout(bleed,5,2,2,20,10)).toThrow(/间距不足/);
 expect(variableLayout(bleed,5,2,2,20,20).positions).toHaveLength(5);
 expect(()=>variableLayout(template,100,1,1,0,0)).toThrow(/普通画布范围/);
});
it('QR matrices independently decode Chinese and URL payloads with the intended quiet zone',()=>{
 for(const text of ['张三 / 编号000123','https://example.com/order?id=000123']){
  const matrix=qrMatrix(text,140,140),scale=5,size=(matrix.length+8)*scale,data=new Uint8ClampedArray(size*size*4).fill(255);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const row=Math.floor(y/scale)-4,col=Math.floor(x/scale)-4;if(matrix[row]?.[col]==='1'){const at=(y*size+x)*4;data[at]=data[at+1]=data[at+2]=0;}}
  expect(jsQR(data,size,size)?.data).toBe(text);
 }
 expect(()=>qrMatrix('张三',5,5)).toThrow(/0.2 mm/);
});
it('image paths, empty values and batch limits are checked before native generation',()=>{
 const w=new ExcelJS.Workbook();w.addWorksheet('数据').addRows([['图片'],['照片.png']]);const table=workbookTable(w),b={...newBinding('A','t0','one'),kind:'image' as const};
 expect(buildVariablePlan(table,template,[b],[2],'','').errors[0]!.reason).toMatch(/基准目录/);
 expect(buildVariablePlan(table,template,[b],[2],'','C:/照片').records[0]!.values[0]!.text).toBe('C:/照片/照片.png');
 expect(()=>buildVariablePlan(table,template,[b],Array(101).fill(2),'','')).toThrow(/1–100/);
});
