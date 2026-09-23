import type { EditorState, RulerUnit } from '@aiq/contracts';

export const UNIT_FACTORS: Record<RulerUnit, number> = { mm:72/25.4, cm:72/2.54, m:72000/25.4, in:72, pt:1, px:1, pc:12, Q:72/101.6 };
export function unitFactor(unit: RulerUnit | undefined): number {
  if (!unit || !(unit in UNIT_FACTORS)) throw Error('请刷新文档单位后重试');
  return UNIT_FACTORS[unit];
}
export function displayLength(points: number, unit: RulerUnit): string {
  return String(Number((points / unitFactor(unit)).toFixed(2)));
}
/** UI numbers are 1-based, returned indexes are 0-based in the requested page order. */
export function parseArtboardRange(text: string, count: number): number[] {
  if (!text.trim()) return [];
  const result: number[]=[];
  for (const part of text.split(/[,，]/)) {
    const match=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw Error('画板范围格式：1,3,5-8');
    const start=Number(match[1]),end=Number(match[2]??match[1]);
    if(start<1||end<1||start>count||end>count)throw Error('画板编号超出范围');
    const step=start<=end?1:-1;
    for(let n=start;;n+=step){if(!result.includes(n-1))result.push(n-1);if(n===end)break;}
  }
  return result;
}
export function artboardNames(boards:EditorState['artboards'], indexes:number[], pattern:string, start:number, unit:RulerUnit, find='',replacement=''):Array<{index:number;name:string}> {
  if(!pattern.trim()||!Number.isInteger(start)||start<0)throw Error('填写命名模板和非负起始序号');
  return indexes.map((index,offset)=>{
    const board=boards[index];if(!board)throw Error('画板已改变，请刷新');
    const values:Record<string,string>={name:find?board.name.split(find).join(replacement):board.name,n:String(start+offset),nn:String(start+offset).padStart(2,'0'),nnn:String(start+offset).padStart(3,'0'),w:displayLength(board.bounds[2]-board.bounds[0],unit),h:displayLength(board.bounds[3]-board.bounds[1],unit),u:unit};
    const name=pattern.replace(/\{(name|nnn|nn|n|w|h|u)\}/g,(_,key:string)=>values[key]??'').trim();
    if(!name||name.length>240||Array.from(name).some(char=>char.charCodeAt(0)<32))throw Error('名称须为 1–240 个字符，不能包含换行');
    return {index,name};
  });
}
