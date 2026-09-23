import type { VariableCell, VariableHeaderDirection, VariableTable } from '@aiq/contracts';
import type { Cell, Workbook } from 'exceljs';
import { format as numberFormat } from 'ssf';
const MAX_ROWS=1000,MAX_COLS=64,MAX_CELLS=20000;
const columnId=(i:number)=>{let s='';for(let n=i;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const plain=(text:string,bold=false):VariableCell=>text.length>20000?{text:'',runs:[],error:'单个单元格超过 20000 字符'}:{text,runs:[{text,bold}]};
export function parseCSV(text:string,direction:VariableHeaderDirection='row'):string[][] {
 if(text.length>5_000_000)throw Error('CSV 超过 500 万字符，请拆分');
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;
 const cell=()=>{row.push(value);value='';closed=false;if(row.length>(direction==='column'?MAX_ROWS+1:MAX_COLS))throw Error('表格维度超限，最多 64 个字段、1000 条记录');};
 const line=()=>{cell();rows.push(row);row=[];if(rows.length>(direction==='column'?MAX_COLS:MAX_ROWS+1))throw Error('表格维度超限，最多 64 个字段、1000 条记录');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i]!;
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
  else if(c==='"'){if(value||closed)throw Error('CSV 引号位置错误');quoted=true;}
  else if(c===',')cell();else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
  else{if(closed)throw Error('CSV 引号结束后含多余字符');value+=c;}
 }
 if(quoted)throw Error('CSV 引号未闭合');if(value||row.length||closed)line();return rows;
}
function table(rows:Array<{row:number;values:VariableCell[]}>,sheet:string,sheets:string[],warnings:string[],direction:VariableHeaderDirection='row'):VariableTable {
 if(direction==='column'){const source=rows,width=Math.max(0,...source.map(r=>r.values.length));rows=Array.from({length:width},(_,i)=>({row:i+1,values:source.map(r=>r.values[i]??plain(''))}));warnings.push('首列作为标题；原行号对应转置前的列序号');}
 const header=rows[0];if(!header||!header.values.some(c=>c.text.trim()))throw Error('第一行必须是表头');
 const width=Math.max(...rows.map(r=>r.values.length));if(width>MAX_COLS||rows.length>MAX_ROWS+1||rows.length*width>MAX_CELLS)throw Error('表格超过 1000 行／64 列／20000 单元格，请拆分');
 const columns=Array.from({length:width},(_,i)=>({id:columnId(i+1),label:columnId(i+1)+' · '+(header.values[i]?.text.trim()||'未命名列')}));
 return {sheet,sheets,columns,warnings,rows:rows.slice(1).filter(r=>r.values.some(c=>c.text!==''||c.error)).map(r=>({row:r.row,cells:Object.fromEntries(columns.map((c,i)=>[c.id,r.values[i]??plain('')]))}))};
}
/** Bound the ZIP's declared expansion before handing it to the XLSX library. */
export function checkXlsxZip(bytes:ArrayBuffer):void {
 if(bytes.byteLength>10*1024*1024)throw Error('XLSX 超过 10 MB，请拆分');
 const v=new DataView(bytes);let end=-1;
 for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('不是有效 XLSX 文件，或文件已加密');
 const count=v.getUint16(end+10,true);let offset=v.getUint32(end+16,true),size=0;
 if(count>2048||count===65535)throw Error('XLSX 内部文件过多');
 for(let i=0;i<count;i++){
  if(offset+46>v.byteLength||v.getUint32(offset,true)!==0x02014b50)throw Error('XLSX 压缩目录损坏');
  if(v.getUint16(offset+8,true)&1)throw Error('不支持加密 XLSX');
  size+=v.getUint32(offset+24,true);if(size>32*1024*1024)throw Error('XLSX 展开超过 32 MB，请另存精简工作簿');
  offset+=46+v.getUint16(offset+28,true)+v.getUint16(offset+30,true)+v.getUint16(offset+32,true);
 }
}
export function excelCell(cell:Cell):VariableCell {
 let value=cell.value;
 if(value===null||value===undefined)return plain('');
 if(typeof value==='object'&&('formula' in value||'sharedFormula' in value)){
  if(value.result===undefined||value.result===null)return {...plain(''),error:'公式没有已保存的计算结果，请先在 Excel 中计算并保存'};
  value=value.result;
 }
 if(typeof value==='object'&&'error' in value)return {...plain(''),error:'表格错误：'+value.error};
 const bold=cell.font?.bold===true;
 if(typeof value==='object'&&'richText' in value){const runs=value.richText.map(r=>({text:r.text,bold:r.font?.bold??bold})),text=runs.map(r=>r.text).join('');return text.length>20000?plain(text):{text,runs};}
 if(typeof value==='object'&&'hyperlink' in value)return plain(String(value.text??value.hyperlink),bold);
 let text:string;
 try{if(value instanceof Date){const serial=value.getTime()/86400000+25569;text=numberFormat(cell.numFmt&&cell.numFmt!=='General'?cell.numFmt:'yyyy-mm-dd',serial);}
  else if(typeof value==='number'){if(!Number.isFinite(value))throw Error('非有限数字');text=numberFormat(cell.numFmt||'General',value);}
  else if(typeof value==='string'||typeof value==='boolean')text=String(value);else return {...plain(''),error:'未支持的单元格类型'};
 }catch{return {...plain(''),error:'无法解析单元格显示格式'};}
 if(text.length>20000)return {...plain(''),error:'单个单元格超过 20000 字符'};
 return plain(text,bold);
}
export function workbookTable(workbook:Workbook,sheetName?:string,includeHidden=false,direction:VariableHeaderDirection='row'):VariableTable {
 const sheet=sheetName?workbook.getWorksheet(sheetName):workbook.worksheets[0];if(!sheet)throw Error('找不到工作表');
 if(sheet.rowCount>(direction==='column'?MAX_COLS:MAX_ROWS+1)||sheet.columnCount>(direction==='column'?MAX_ROWS+1:MAX_COLS)||sheet.rowCount*sheet.columnCount>MAX_CELLS)throw Error('所选工作表超过 1000 条记录／64 个字段／20000 单元格');
 if(sheet.model.merges?.length)throw Error('请先取消所选工作表的合并单元格');
 const warnings:string[]=[];if((sheet as unknown as {conditionalFormattings?:unknown[]}).conditionalFormattings?.length)warnings.push('条件格式的加粗／颜色未计算，仅读取直接设置的格式');
 let skipped=0;const rows:Array<{row:number;values:VariableCell[]}>=[];
 for(let n=1;n<=sheet.rowCount;n++){const row=sheet.getRow(n);if(n>1&&row.hidden&&!includeHidden){skipped++;continue;}rows.push({row:n,values:Array.from({length:sheet.columnCount},(_,i)=>excelCell(row.getCell(i+1)))});}
 if(skipped)warnings.push('已跳过 '+skipped+' 个隐藏行');
 if(rows.some(r=>r.values.some(c=>c.error)))warnings.push('部分单元格含错误；绑定这些列时会阻止对应行生成');
 return table(rows,sheet.name,workbook.worksheets.map(s=>s.name),warnings,direction);
}
export async function readTable(bytes:ArrayBuffer,name:string,sheetName?:string,includeHidden=false,encoding='utf-8',direction:VariableHeaderDirection='row'):Promise<VariableTable> {
 if(/\.csv$/i.test(name)){const rows=parseCSV(new TextDecoder(encoding,{fatal:true}).decode(bytes),direction);return table(rows.map((values,i)=>({row:i+1,values:values.map(v=>plain(v))})),'CSV',['CSV'],['CSV 不包含字体加粗信息'],direction);}
 if(!/\.xlsx$/i.test(name))throw Error('请选择 XLSX 或 CSV；旧 XLS 请先另存为 XLSX');
 checkXlsxZip(bytes);const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(bytes);return workbookTable(workbook,sheetName,includeHidden,direction);
}
