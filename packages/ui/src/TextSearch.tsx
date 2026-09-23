import {usePreference} from './preference.js';
import { useEffect, useRef, useState } from 'react';
import type { EditorAction, EditorFont, EditorResult, TextFill } from '@aiq/contracts';
import { Button, Card, Field } from './components.js';
import { useEditor, EditorFeedback, Segments } from './editor.js';
import type { EditorPort } from './editor.js';

const fontsCache = new WeakMap<EditorPort, EditorFont[]>();
export function SearchFontField({label,value,onChange,fonts}:{label:string;value:string;onChange:(value:string)=>void;fonts:EditorFont[]}) {
 const [query,setQuery]=useState(''),needle=query.toLowerCase(),families=[...new Set(fonts.filter(f=>!needle||`${f.family} ${f.style}`.toLowerCase().includes(needle)).map(f=>f.family))],matches=families.slice(0,60),known=fonts.find(f=>f.name===value||f.family===value);
 return <div><Field label={`${label}筛选`}><input className="aiq-input" aria-label={`${label}筛选`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索已安装字体家族" title="输入仅筛选列表；请从下方实际字体家族中选择。每次最多显示 60 项。"/></Field><Field label={label}><select className="aiq-input" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="">不限定 / 未指定</option>{value&&!matches.includes(value)&&<option value={value}>{known?`${known.family} · ${known.style}`:`${value}（待加载核对）`}</option>}{matches.map(f=><option key={f} value={f}>{f}</option>)}</select></Field></div>;
}
function StyleField({label,value,onChange,fonts,family}:{label:string;value:string;onChange:(v:string)=>void;fonts:EditorFont[];family:string}) {
 const styles=[...new Set(fonts.filter(f=>!family||f.family===family||f.name===family).map(f=>f.style))].sort();
 return <Field label={label}><select className="aiq-input" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="">不限定 / 保留原款式</option>{value&&!styles.includes(value)&&<option value={value}>{value}（待核对）</option>}{styles.map(s=><option key={s} value={s}>{s}</option>)}</select></Field>;
}
interface FillDraft {kind:TextFill['kind'];values:string[];spot?:Extract<TextFill,{kind:'spot'}>}
const blankFill=():FillDraft=>({kind:'rgb',values:['0','0','0']});
function fillDraft(fill:TextFill):FillDraft {return {kind:fill.kind,values:'values' in fill?fill.values.map(String):[],...(fill.kind==='spot'?{spot:fill}:{})};}
function parseFill(draft:FillDraft):TextFill {
 if(draft.kind==='none')return {kind:'none'};
 if(draft.kind==='spot'){if(!draft.spot)throw Error('请从当前文档取样专色');return draft.spot;}
 const values=draft.values.map(v=>v.trim()?Number(v):NaN),max=draft.kind==='rgb'?255:100,count=draft.kind==='rgb'?3:draft.kind==='cmyk'?4:1;
 if(values.length!==count||values.some(v=>!Number.isFinite(v)||v<0||v>max))throw Error(`填色通道须为 0–${max} 的数字`);
 return {kind:draft.kind,values} as TextFill;
}
function FillField({label,value,onChange,onSample,busy}:{label:string;value:FillDraft;onChange:(v:FillDraft)=>void;onSample:()=>void;busy:boolean}) {
 const names=value.kind==='rgb'?['R','G','B']:value.kind==='cmyk'?['C','M','Y','K']:value.kind==='gray'?['灰度']:[];
 return <div><Field label={`${label}色彩模式`}><select className="aiq-input" aria-label={`${label}色彩模式`} value={value.kind} onChange={e=>{const kind=e.target.value as FillDraft['kind'];onChange({kind,values:Array(kind==='rgb'?3:kind==='cmyk'?4:kind==='gray'?1:0).fill('0') as string[]});}}><option value="rgb">RGB</option><option value="cmyk">CMYK</option><option value="gray">灰度</option><option value="none">无填色</option>{value.kind==='spot'&&<option value="spot">{value.spot?`专色：${value.spot.name} · ${value.spot.tint}%`:'专色（请重新取样）'}</option>}</select></Field><div className="wb-form-grid">{names.map((n,i)=><Field key={n} label={n}><input className="aiq-input" aria-label={`${label} ${n}`} inputMode="decimal" value={value.values[i]??''} onChange={e=>onChange({...value,values:value.values.map((v,j)=>i===j?e.target.value:v)})}/></Field>)}</div><Button disabled={busy} title="仅取样所选字符的填色，可用于字体和字号混合的文字。保留 RGB、CMYK、灰度和专色身份；渐变与图案不支持。" onClick={onSample}>取样{label}</Button></div>;
}
export function TextSearch({workspace,fontMode=false}:{workspace:EditorPort;fontMode?:boolean}) {
 const e=useEditor(workspace,'document'),[query,setQuery]=usePreference(workspace,'textSearch.query',''),[replacement,setReplacement]=usePreference(workspace,'textSearch.replacement',''),[scope,setScope]=usePreference<'document'|'selection'|'artboard'|'layer'>(workspace,'textSearch.scope','document');
 const [matchCase,setMatchCase]=usePreference(workspace,'textSearch.matchCase',false),[wholeWord,setWholeWord]=usePreference(workspace,'textSearch.wholeWord',false),[font,setFont]=usePreference(workspace,'textSearch.font',''),[fontStyle,setFontStyle]=usePreference(workspace,'textSearch.fontStyle',''),[fontSize,setFontSize]=usePreference(workspace,'textSearch.fontSize',''),[sizeCompare,setSizeCompare]=usePreference<'equal'|'greater'|'less'>(workspace,'textSearch.sizeCompare','equal');
 const [replacementFamily,setReplacementFamily]=usePreference(workspace,'textSearch.replacementFamily',''),[replacementStyle,setReplacementStyle]=usePreference(workspace,'textSearch.replacementStyle',''),[replacementSize,setReplacementSize]=usePreference(workspace,'textSearch.replacementSize','');
 const [changeFamily,setChangeFamily]=usePreference(workspace,'textSearch.changeFamily',false),[changeStyle,setChangeStyle]=usePreference(workspace,'textSearch.changeStyle',false),[changeSize,setChangeSize]=usePreference(workspace,'textSearch.changeSize',false),[changeFill,setChangeFill]=usePreference(workspace,'textSearch.changeFill',false);
 const [matchFill,setMatchFill]=useState(false),[searchFill,setSearchFill]=useState<FillDraft>(blankFill);
 const [savedReplacementFill,setSavedReplacementFill]=usePreference<FillDraft>(workspace,'textSearch.replacementFill',blankFill()),[sampledReplacementSpot,setSampledReplacementSpot]=useState<Extract<TextFill,{kind:'spot'}>>();
 const replacementFill:FillDraft={...savedReplacementFill,spot:sampledReplacementSpot};
 const setReplacementFill=(value:FillDraft)=>{setSavedReplacementFill({kind:value.kind,values:value.values});setSampledReplacementSpot(value.spot);};
 const [fonts,setFonts]=useState<EditorFont[]>(()=>fontsCache.get(workspace)??[]),[result,setResult]=useState<EditorResult|null>(null),[selected,setSelected]=useState<number[]>([]),[current,setCurrent]=useState(-1),[page,setPage]=useState(0),generation=useRef(0);
 const doc=e.state?.docSessionId;
 useEffect(()=>{setMatchFill(false);setSearchFill(blankFill());setSampledReplacementSpot(undefined);},[doc]);
 useEffect(()=>{generation.current++;setResult(null);setSelected([]);setCurrent(-1);setPage(0);},[doc,query,scope,matchCase,wholeWord,font,fontStyle,fontSize,sizeCompare,matchFill,searchFill]);
 const run=async(operation:Extract<EditorAction,{type:'text-search'}>['operation'],indexes?:number[])=>{
  const visit=generation.current;
  const r=await e.act(()=>{
   if(fontSize.trim()&&(!Number.isFinite(Number(fontSize))||Number(fontSize)<0.1||Number(fontSize)>1296))throw Error('字号须为 0.1–1296 的数字');
   const changes:Partial<Extract<EditorAction,{type:'text-search'}>>={};
   if(operation==='replace-style'){
    if(!changeFamily&&!changeStyle&&!changeSize&&!changeFill)throw Error('请至少选择一个替换属性');
    if(changeFamily){if(!replacementFamily||!fonts.some(f=>f.family===replacementFamily))throw Error('请加载字体库并选择替换字体家族');changes.replacementFamily=replacementFamily;}
    if(changeStyle){if(!replacementStyle||!fonts.some(f=>f.style===replacementStyle&&(!changeFamily||f.family===replacementFamily)))throw Error('请选择字体库中的替换款式');changes.replacementStyle=replacementStyle;}
    if(changeSize){const size=Number(replacementSize);if(!replacementSize.trim()||!Number.isFinite(size)||size<0.1||size>1296)throw Error('替换字号须为 0.1–1296 的数字');changes.replacementSize=size;}
    if(changeFill)changes.replacementFill=parseFill(replacementFill);
   }
   return {type:'text-search',query,scope,matchCase,wholeWord,font:font.trim()||undefined,fontStyle:fontStyle.trim()||undefined,fontSize:fontSize.trim()?Number(fontSize):undefined,...(matchFill?{textFill:parseFill(searchFill)}:{}),sizeCompare,operation,replacement,...changes,searchToken:operation==='find'?undefined:result?.searchToken,matchIndexes:indexes};
  });
  if(visit!==generation.current)return;
  if(operation==='find'&&r){setResult(r);setSelected([]);setCurrent(-1);setPage(0);}
  if(operation==='replace'||operation==='replace-font'||operation==='replace-style'){setResult(null);setSelected([]);}
  if(operation==='locate'&&r&&indexes){setCurrent(indexes[0]!);setPage(Math.floor(indexes[0]!/60));}
 };
 const count=result?.matchCount??0,canFind=!!(query||font.trim()||fontStyle.trim()||fontSize.trim()||matchFill),canReplace=!fontMode||changeFamily||changeStyle||changeSize||changeFill;
 const loadFonts=async()=>{const r=await e.act({type:'fonts'});if(r?.fonts){fontsCache.set(workspace,r.fonts);setFonts(r.fonts);}};
 const sampleFill=async(target:'search'|'replacement')=>{const visit=generation.current,r=await e.act({type:'sample-text-style',fields:['fill']});if(visit!==generation.current)return;if(r?.textSample?.fill){if(target==='search'){setSearchFill(fillDraft(r.textSample.fill));setMatchFill(true);}else{setReplacementFill(fillDraft(r.textSample.fill));setChangeFill(true);}}};
 return <Card title={fontMode?'字体样式替换':'文字查找与替换'} icon="search">
  <Segments label="文字查找范围" value={scope} onChange={setScope} options={[["document","整个文档"],["selection","所选对象 / 群组"],["artboard","当前画板"],["layer","当前图层"]]}/>
  <Button disabled={e.busy} title="用文字工具选择同样式字符；混合属性不会默取首字。仅需颜色时使用取样填色。" onClick={()=>{const visit=generation.current;void e.act({type:'sample-text-style'}).then(r=>{if(visit!==generation.current)return;const sample=r?.textSample;if(sample){if(sample.fontFamily||sample.font)setFont(sample.fontFamily||sample.font!);if(sample.fontStyle)setFontStyle(sample.fontStyle);if(sample.fontSize!==undefined)setFontSize(String(Number(sample.fontSize.toFixed(2))));if(sample.fill){setSearchFill(fillDraft(sample.fill));setMatchFill(true);}setSizeCompare('equal');}});}}>从选中文字取样样式</Button>
  <Field label={fontMode?'限定文字（可留空）':'查找内容'}><input className="aiq-input" title="限定文字与下方全部样式条件同时满足才匹配，仅替换命中的字符片段。" aria-label="查找文字内容" value={query} onChange={v=>setQuery(v.target.value)} onKeyDown={v=>{if(!v.nativeEvent.isComposing&&v.keyCode!==229&&v.key==='Enter'&&canFind)void run('find');}}/></Field>
  <div className="wb-scope-options"><label><input type="checkbox" checked={matchCase} onChange={v=>setMatchCase(v.target.checked)}/>区分大小写</label><label><input type="checkbox" checked={wholeWord} onChange={v=>setWholeWord(v.target.checked)}/>整个词匹配</label></div>
  <details className="wb-search-options" open={fontMode||undefined}><summary>字体、款式、字号与填色条件</summary>
   <SearchFontField label="查找字体" value={font} onChange={setFont} fonts={fonts}/><Button disabled={e.busy} onClick={()=>void loadFonts()}>加载字体库</Button>
   <div className="wb-form-grid"><StyleField label="查找款式" value={fontStyle} onChange={setFontStyle} fonts={fonts} family={font}/><Field label="字号 pt"><input className="aiq-input" aria-label="查找字号" inputMode="decimal" value={fontSize} onChange={v=>setFontSize(v.target.value)}/></Field></div>
   <Segments label="字号比较" value={sizeCompare} onChange={setSizeCompare} options={[["equal","等于"],["greater","大于"],["less","小于"]]}/>
   <label title="按原生色彩模型和精确通道匹配；专色同时核对名称、色调和基色。"><input type="checkbox" checked={matchFill} onChange={e=>setMatchFill(e.target.checked)}/>匹配填色</label>
   {matchFill&&<FillField label="查找填色" value={searchFill} onChange={setSearchFill} onSample={()=>void sampleFill('search')} busy={e.busy}/>}
  </details>
  <Button variant="primary" disabled={e.busy||!canFind} onClick={()=>void run('find')}>查找</Button>
  {fontMode&&<details className="wb-search-options" open><summary title="仅修改勾选属性。只改家族时逐字保留原款式；缺少对应款式会在写入前报错。">替换指定样式</summary>
   <label><input type="checkbox" checked={changeFamily} onChange={e=>setChangeFamily(e.target.checked)}/>替换字体家族</label>{changeFamily&&<SearchFontField label="替换字体" value={replacementFamily} onChange={setReplacementFamily} fonts={fonts}/>}
   <label><input type="checkbox" checked={changeStyle} onChange={e=>setChangeStyle(e.target.checked)}/>替换款式</label>{changeStyle&&<StyleField label="替换为款式" value={replacementStyle} onChange={setReplacementStyle} fonts={fonts} family={changeFamily?replacementFamily:''}/>}
   <label><input type="checkbox" checked={changeSize} onChange={e=>setChangeSize(e.target.checked)}/>替换字号</label>{changeSize&&<Field label="替换字号 pt"><input className="aiq-input" aria-label="替换字号 pt" inputMode="decimal" value={replacementSize} onChange={e=>setReplacementSize(e.target.value)}/></Field>}
   <label><input type="checkbox" checked={changeFill} onChange={e=>setChangeFill(e.target.checked)}/>替换填色</label>{changeFill&&<FillField label="替换填色" value={replacementFill} onChange={setReplacementFill} onSample={()=>void sampleFill('replacement')} busy={e.busy}/>}
  </details>}
  {result&&<><p role="status">匹配 {count} 处{current>=0?` · 当前第 ${current+1} 处`:''}</p>
   {result.skipped.length>0&&<div role="status">未完成 / 跳过 {result.skipped.length} 项：{[...new Set(result.skipped.map(item=>item.reason))].slice(0,5).join('；')}</div>}
   <div className="aiq-row"><Button disabled={e.busy||current<=0} onClick={()=>void run('locate',[current-1])}>上一个</Button><Button disabled={e.busy||current+1>=count} onClick={()=>void run('locate',[current+1])}>下一个</Button><Button title="Illustrator 仅支持单处字符高亮；此按钮选择包含匹配片段的整个文本框。隐藏、锁定文字不参与。" disabled={e.busy||!count} onClick={()=>void run('select')}>选择所有匹配文本框</Button></div>
   <div className="wb-search-results">{result.matches?.slice(page*60,(page+1)*60).map(m=><div key={m.index} className="wb-search-hit"><input type="checkbox" aria-label={`勾选第 ${m.index+1} 处`} checked={selected.includes(m.index)} onChange={v=>setSelected(v.target.checked?[...selected,m.index]:selected.filter(i=>i!==m.index))}/><button aria-current={current===m.index?'true':undefined} disabled={e.busy} onClick={()=>void run('locate',[m.index])}>{m.index+1}. {m.preview}</button></div>)}</div>
   <div className="aiq-row"><Button disabled={e.busy||!count} onClick={()=>setSelected((result.matches??[]).map(m=>m.index))}>全选</Button><Button disabled={e.busy||!count} onClick={()=>setSelected((result.matches??[]).filter(m=>!selected.includes(m.index)).map(m=>m.index))}>反选</Button><Button disabled={e.busy||!selected.length} onClick={()=>setSelected([])}>取消选择</Button></div>
   <div className="aiq-row"><Button disabled={!page} onClick={()=>setPage(page-1)}>上一页</Button><Button disabled={(page+1)*60>=count} onClick={()=>setPage(page+1)}>下一页</Button><span>已勾选 {selected.length} 处</span></div>
   {!fontMode&&<Field label="替换为（可留空删除）"><input className="aiq-input" aria-label="替换文字内容" value={replacement} onChange={v=>setReplacement(v.target.value)}/></Field>}
   <div className="aiq-row"><Button variant="primary" disabled={e.busy||!count||!canReplace} onClick={()=>void run(fontMode?'replace-style':'replace')}>替换全部匹配</Button><Button disabled={e.busy||!selected.length||!canReplace} onClick={()=>void run(fontMode?'replace-style':'replace',selected)}>替换勾选项</Button></div>
  </>}
  <EditorFeedback message={e.message} error={e.error}/>
 </Card>;
}
