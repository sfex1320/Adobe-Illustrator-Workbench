import {useEffect} from 'react';
import type {Workspace} from '@aiq/core';
import {adjustArtboardEdges,parseNumberExpression,unitFactor} from '@aiq/core';
import {Button,Field,usePreference} from '@aiq/ui';
import type {EditorState,EditorAction} from '@aiq/contracts';
export function ArtboardEdges({workspace,state,busy,apply,targets}:{workspace:Workspace;state:EditorState|null;busy:boolean;apply:(action:(s:EditorState)=>EditorAction)=>unknown;targets:(s:EditorState)=>number[]}){
 const [draft,setDraft]=usePreference(workspace,'artboards.edges',['0','0','0','0']),[locked,setLocked]=usePreference(workspace,'artboards.edgesLocked',true);
 const unit=state?.rulerUnit;
 const [draftUnit,setDraftUnit]=usePreference(workspace,'artboards.edgesUnit','mm');
 useEffect(()=>{if(!unit||unit===draftUnit)return;const old=unitFactor(draftUnit as NonNullable<EditorState['rulerUnit']>),next=unitFactor(unit);setDraft(values=>values.map(v=>{try{return String(Number((parseNumberExpression(v)*old/next).toFixed(2)));}catch{return v;}}));setDraftUnit(unit);},[unit,draftUnit]); // eslint-disable-line react-hooks/exhaustive-deps
 return <details className="wb-details wb-artboard-edges"><summary>便捷调整四边</summary><p className="wb-inline-note">正数向外扩展，负数向内收缩；设计稿保持原位置和大小。</p><label className="wb-check"><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/>锁定四边</label><div className="wb-form-grid">{['左','上','右','下'].map((label,index)=><Field key={label} label={`${label} ${unit??''}`}><input className="aiq-input" aria-label={`${label}边调整`} inputMode="decimal" value={draft[index]??'0'} onChange={e=>setDraft([0,1,2,3].map(i=>locked||i===index?e.target.value:draft[i]??'0'))}/></Field>)}</div><Button variant="primary" disabled={busy||!unit} onClick={()=>apply(s=>{if(!s.rulerUnit||s.rulerUnit!==unit)throw Error('文档单位已变化，请核对调整值');const chosen=targets(s);if(!chosen.length)throw Error('请选择画板');const values=draft.map(v=>parseNumberExpression(v)*unitFactor(s.rulerUnit));return {type:'artboards-update',moveArtwork:false,boards:chosen.map(index=>{const b=s.artboards.find(board=>board.index===index);if(!b)throw Error('画板已失效');return {index,bounds:adjustArtboardEdges(b.bounds,values)};})};})}>应用四边调整</Button></details>;
}
