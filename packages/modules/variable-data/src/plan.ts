import QRCode from 'qrcode';
import type {VariableBinding,VariableRowPlan,VariableTable,VariableTemplate} from '@aiq/contracts';
export const newBinding=(column:string,targetId:string,id:string):VariableBinding=>({id,column,targetId,kind:'text',placeholder:'',empty:'error',fit:'contain',style:'template',font:'',boldFont:'',characterStyle:'',graphicStyle:'',fill:'',overflow:'error',minSize:8});
export function qrMatrix(text:string,widthPt:number,heightPt:number):string[] {
 if(!text||text.length>2000)throw Error('二维码内容为空或超过 2000 字符');
 const {modules}=QRCode.create(text,{errorCorrectionLevel:'M'}),modulePt=Math.min(widthPt,heightPt)/(modules.size+8);
 if(modulePt<72/25.4*0.2)throw Error('二维码模块小于 0.2 mm，请放大占位对象或缩短内容');
 return Array.from({length:modules.size},(_,r)=>Array.from({length:modules.size},(_,c)=>modules.get(r,c)?'1':'0').join(''));
}
export function localImagePath(value:string,base:string):string {
 const path=value.trim().replace(/\\/g,'/');
 if(/^[a-z]+:\/\//i.test(path)||path.startsWith('//'))throw Error('图片请使用本地文件路径');
 const absolute=/^[a-z]:\//i.test(path)||path.startsWith('/');
 if(!absolute&&!base.trim())throw Error('相对图片路径需要设置图片基准目录');
 const resolved=absolute?path:base.replace(/\\/g,'/').replace(/\/$/,'')+'/'+path;
 if([...resolved].some(c=>c.charCodeAt(0)<32)||!/\.(png|jpe?g|tiff?|psd)$/i.test(resolved))throw Error('图片支持本地 PNG、JPG、TIFF、PSD');
 return resolved;
}
/** Directory order never determines data binding. A stem is usable only when unique. */
export function matchImageFile(value:string,files:readonly string[]):string {
 const name=value.trim();if(!name||/[\\/]/.test(name))throw Error('图片目录模式请填写文件名（可含扩展名），不能填写路径');
 const basename=(path:string)=>path.replace(/\\/g,'/').split('/').pop()!;
 const exact=files.filter(path=>basename(path)===name);
 if(exact.length===1)return exact[0]!;
 if(exact.length>1)throw Error('图片文件名重复：'+name);
 const matches=files.filter(path=>basename(path).replace(/\.[^.]+$/,'')===name);
 if(matches.length!==1)throw Error(matches.length?'图片名称对应多个扩展名，请填写完整文件名：'+name:'图片目录中找不到：'+name);
 return matches[0]!;
}
export function variableLayout(template:VariableTemplate,count:number,columns:number,rowsPerBlock:number,horizontalGap:number,verticalGap:number){
 if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(columns)||columns<1||columns>10||!Number.isInteger(rowsPerBlock)||rowsPerBlock<1||rowsPerBlock>100||![horizontalGap,verticalGap].every(n=>Number.isFinite(n)&&n>=0&&n<=3000))throw Error('行列容量或间距无效；间距不能为负');
 const width=template.width,height=template.height,minX=Math.max(0,(template.artworkWidth??width)-width),minY=Math.max(0,(template.artworkHeight??height)-height);
 const capacity=columns*rowsPerBlock;
 if((count>1&&columns>1||count>capacity)&&horizontalGap+0.001<minX||count>columns&&rowsPerBlock>1&&verticalGap+0.001<minY)throw Error('间距不足，模板含画板外设计；横向至少 '+(minX*25.4/72).toFixed(2)+' mm，纵向至少 '+(minY*25.4/72).toFixed(2)+' mm');
 const blockWidth=columns*(width+horizontalGap),positions=Array.from({length:count},(_,i)=>({left:Math.floor(i/capacity)*blockWidth+(i%capacity%columns)*(width+horizontalGap),top:-Math.floor(i%capacity/columns)*(height+verticalGap)}));
 const totalWidth=Math.max(...positions.map(p=>p.left+width)),totalHeight=Math.max(...positions.map(p=>-p.top+height));
 if(totalWidth>14400||totalHeight>14400)throw Error('本批排布超过普通画布范围，请减少记录或调整行列容量');
 return {positions,totalWidth,totalHeight,capacity};
}
export function buildVariablePlan(table:VariableTable,template:VariableTemplate,bindings:VariableBinding[],rows:number[],nameColumn:string,base:string,imageFiles?:readonly string[]) {
 if(!bindings.length)throw Error('请先绑定至少一列');if(!rows.length||rows.length>100)throw Error('每批请选择 1–100 条记录');
 const ids=new Set<string>(),targets=new Map<string,VariableBinding[]>();
 for(const b of bindings){if(ids.has(b.id))throw Error('绑定编号重复');ids.add(b.id);const target=template.targets.find(t=>t.id===b.targetId);if(!target||!table.columns.some(c=>c.id===b.column))throw Error('绑定对象或表格列已失效');
  const prior=targets.get(b.targetId)??[];if(prior.length&&(!b.placeholder||b.kind!=='text'||prior.some(p=>!p.placeholder||p.kind!=='text'||p.placeholder===b.placeholder)))throw Error('同一对象多个绑定须使用不同文字占位符');
  for(const p of prior){const text=target.text??'',start=text.indexOf(b.placeholder),other=text.indexOf(p.placeholder);if(start<other+p.placeholder.length&&other<start+b.placeholder.length)throw Error('同一文字框的字段范围不能重叠');}
  prior.push(b);targets.set(b.targetId,prior);
  if(b.kind==='text'&&target.kind!=='TextFrame')throw Error('文字列必须绑定文字对象');
  if(b.kind==='image'&&target.rectangle===false)throw Error('图片列必须绑定未旋转的矩形对象，用作剪切蒙版');
  if(b.opacity!==undefined&&(!Number.isFinite(b.opacity)||b.opacity<0||b.opacity>100))throw Error('不透明度须为 0–100');
  if(b.size!==undefined&&(!Number.isFinite(b.size)||b.size<0.1||b.size>1296))throw Error('字号须为 0.1–1296');
 }
 const records:VariableRowPlan[]=[],errors:Array<{row:number;reason:string}>=[];
 for(const rowNo of rows){const row=table.rows.find(r=>r.row===rowNo);if(!row)throw Error('数据行已失效');
  try{const values=bindings.map(b=>{const cell=row.cells[b.column]!;if(cell.error)throw Error(b.column+' 列：'+cell.error);const target=template.targets.find(t=>t.id===b.targetId)!;
    if(!cell.text){if(b.empty==='keep')return {bindingId:b.id,text:'',runs:[],skip:true};if(b.empty==='error'||b.kind!=='text')throw Error(b.column+' 列为空');}
    if(b.kind==='text'&&b.style!=='template'&&cell.runs.some(r=>r.bold)&&!b.boldFont)throw Error(b.column+' 列含加粗，请指定粗体字体款式');
    if(b.kind==='text'&&b.placeholder){const text=target.text??'',at=text.indexOf(b.placeholder);if(at<0||text.indexOf(b.placeholder,at+1)>=0)throw Error('占位符必须在目标文字中唯一出现');}
    if(b.kind==='opacity'&&(!/^\d+(\.\d+)?$/.test(cell.text.trim())||Number(cell.text)<0||Number(cell.text)>100))throw Error('透明度列必须是 0–100');
    if(b.kind==='fill'&&!/^#[0-9a-f]{6}$/i.test(cell.text.trim()))throw Error('填色列请使用 #RRGGBB');
    return {bindingId:b.id,text:b.kind==='image'?(imageFiles?matchImageFile(cell.text,imageFiles):localImagePath(cell.text,base)):cell.text,runs:cell.runs, ...(b.kind==='qr'?{qr:qrMatrix(cell.text,target.width,target.height)}:{})};
   });
   const name=nameColumn?row.cells[nameColumn]?.text:'记录-'+row.row;if(!name)throw Error('画板名称列为空');
   records.push({row:row.row,name:[...String(name)].map(c=>c.charCodeAt(0)<32?' ':c).join('').slice(0,100),values});
  }catch(error){errors.push({row:row.row,reason:error instanceof Error?error.message:String(error)});}
 }
 return {records,errors};
}
