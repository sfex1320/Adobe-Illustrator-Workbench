import type {EditorState} from '@aiq/contracts';
import {Segments} from './editor.js';
export type BoardSelectionMode='active'|'odd'|'even'|'all'|'custom';
/** Resolve again inside an explicit command; failed native reads are never one board. */
export function resolveBoardTargets(state:EditorState,mode:BoardSelectionMode,custom:number[]=[],boards=state.artboards):number[]{
 if(mode==='active'&&state.artboardSelectionError)throw Error(state.artboardSelectionError);
 if(mode==='custom'&&custom.some(i=>!Number.isInteger(i)||!boards.some(b=>b.index===i)))throw Error('指定画板已失效，请重新选择范围');
 return boardTargets(boards,state.activeArtboard,mode,custom,state.selectedArtboards);
}
export function boardTargets(boards:EditorState['artboards'],active:number,mode:BoardSelectionMode,custom:number[],selected?:number[]):number[]{
 if(mode==='active'&&selected?.length)return [...new Set(selected)].filter(i=>boards.some(b=>b.index===i));
 if(mode==='active')return boards.some(b=>b.index===active)?[active]:[];
 if(mode==='custom')return [...new Set(custom)].filter(i=>boards.some(b=>b.index===i));
 return boards.filter((_,i)=>mode==='all'||(i+1)%2===(mode==='odd'?1:0)).map(b=>b.index);
}
export function BoardTargets({boards,active,mode,onMode,custom,onCustom,busy=false,selected,selectionError,label="画板操作范围"}:{boards:EditorState['artboards'];active:number;mode:BoardSelectionMode;onMode:(v:BoardSelectionMode)=>void;custom:number[];onCustom:(v:number[])=>void;busy?:boolean;selected?:number[];selectionError?:string;label?:string}){
 return <><Segments label={label} value={mode} onChange={next=>{if(next==='custom'&&mode!=='custom')onCustom(selectionError?[]:boardTargets(boards,active,'active',[],selected));onMode(next);}} options={[["active","当前"],["odd","单数"],["even","双数"],["all","全选"],["custom","多选"]]}/>{mode==='custom'&&<div className="wb-board-grid">{boards.map(b=><label key={b.index}><input type="checkbox" disabled={busy} checked={custom.includes(b.index)} onChange={e=>onCustom(e.target.checked?[...custom,b.index]:custom.filter(i=>i!==b.index))}/>{b.index+1} · {b.name}</label>)}</div>}<p className="wb-inline-note">{mode==='active'&&selectionError?'画板选择读取失败':mode==='active'?`当前选中 ${boardTargets(boards,active,mode,custom,selected).length} 个画板`:`已选 ${boardTargets(boards,active,mode,custom,selected).length} 个画板`}</p>{selectionError&&mode==='active'&&<p className="aiq-error-text" role="alert">{selectionError}</p>}</>;
}
