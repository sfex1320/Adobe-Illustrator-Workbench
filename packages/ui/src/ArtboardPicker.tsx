import type { ReactNode } from 'react';
import type { EditorState } from '@aiq/contracts';
export function ArtboardPicker({boards,selected,onChange,disabled=false,tools}:{boards:EditorState['artboards'];selected:number[];onChange:(v:number[])=>void;disabled?:boolean;tools?:ReactNode}) {
  return <div className="wb-board-picker"><div className="wb-chips">{tools}<button disabled={disabled} onClick={()=>onChange(boards.map(b=>b.index))}>全选</button><button disabled={disabled} onClick={()=>onChange([])}>清空</button></div>
    <div className="wb-board-grid">{boards.map(b=><label key={b.index}><input type="checkbox" aria-label={`画板 ${b.index+1} ${b.name}`} disabled={disabled} checked={selected.includes(b.index)} onChange={e=>onChange(e.target.checked?[...selected,b.index]:selected.filter(n=>n!==b.index))}/><span>{b.index+1} · {b.name}</span></label>)}</div>
    {selected.length>0&&<div className="wb-page-order" aria-label="输出页序">{selected.map((n,i)=><div key={n}><span>{i+1}. {boards[n]?.name??'画板已失效'}</span><button aria-label={`画板 ${n+1} 前移`} disabled={disabled||i===0} onClick={()=>{const next=[...selected];[next[i-1]!,next[i]!]=[next[i]!,next[i-1]!];onChange(next);}}>↑</button><button aria-label={`画板 ${n+1} 后移`} disabled={disabled||i===selected.length-1} onClick={()=>{const next=[...selected];[next[i+1]!,next[i]!]=[next[i]!,next[i+1]!];onChange(next);}}>↓</button></div>)}</div>}
  </div>;
}
