// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {EditorAction,EditorResult,EditorState} from '@aiq/contracts';
import type {Workspace} from '@aiq/core';
import {TextSearch} from '@aiq/ui';
import {EditorSelectionPanel} from '../packages/modules/selection/src/EditorSelectionPanel';
afterEach(cleanup);
function setup(){
 const state:EditorState={token:'editor',docSessionId:'doc',selectionKey:'s',unsaved:true,textSelection:false,symmetryPreview:false,capturedTargets:0,rulerUnit:'pt',activeArtboard:0,objects:[],bounds:null,artboards:[{index:0,name:'一',bounds:[0,0,300,200]}]};
 const editDocument=vi.fn(async(_s:EditorState,a:EditorAction):Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],...(a.type==='fonts'?{fonts:[{name:'ArialMT',family:'Arial',style:'Regular'},{name:'Arial-BoldMT',family:'Arial',style:'Bold'}]}:{}),...((a.type==='text-search'||a.type==='object-search')&&a.operation==='find'?{matchCount:2,searchToken:'result',matches:[{index:0,preview:'第一处目标',count:1},{index:1,preview:'第二处目标',count:1}]}:{})}));
 const workspace={getEditorState:()=>state,readEditorState:async()=>state,editDocument} as unknown as Workspace;
 return {workspace,editDocument};
}
it('font replacement uses the found token and only explicitly checked occurrences',async()=>{
 const {workspace,editDocument}=setup();render(<TextSearch workspace={workspace} fontMode/>);
 fireEvent.click(screen.getByText('加载字体库'));await screen.findByRole('option',{name:'Arial'});
 fireEvent.change(screen.getByLabelText('查找字体'),{target:{value:'Arial'}});fireEvent.change(screen.getByLabelText('查找文字内容'),{target:{value:'目标'}});fireEvent.click(screen.getByText('查找'));
 await screen.findByLabelText('勾选第 2 处');fireEvent.click(screen.getByLabelText('勾选第 2 处'));fireEvent.click(screen.getByLabelText('替换款式'));fireEvent.change(screen.getByLabelText('替换为款式'),{target:{value:'Bold'}});fireEvent.click(screen.getByText('替换勾选项'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(3));expect(editDocument.mock.calls[2]?.[1]).toMatchObject({type:'text-search',query:'目标',font:'Arial',operation:'replace-style',replacementStyle:'Bold',searchToken:'result',matchIndexes:[1],scope:'document'});
});
it('clicking a result locates one occurrence and query edits invalidate its controls',async()=>{
 const {workspace,editDocument}=setup();render(<TextSearch workspace={workspace}/>);fireEvent.change(screen.getByLabelText('查找文字内容'),{target:{value:'目标'}});fireEvent.click(screen.getByText('查找'));
 await screen.findByText('2. 第二处目标');fireEvent.click(screen.getByText('2. 第二处目标'));await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));expect(editDocument.mock.calls[1]?.[1]).toMatchObject({operation:'locate',searchToken:'result',matchIndexes:[1]});
 fireEvent.change(screen.getByLabelText('查找文字内容'),{target:{value:'新词'}});expect(screen.queryByText('选择所有匹配文本框')).not.toBeInTheDocument();
});
it('font-size-only search is available and rejects an invalid numeric draft locally',async()=>{
 const {workspace,editDocument}=setup();render(<TextSearch workspace={workspace} fontMode/>);
 fireEvent.change(screen.getByLabelText('查找字号'),{target:{value:'18'}});fireEvent.click(screen.getByText('大于'));fireEvent.click(screen.getByText('查找'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({query:'',fontSize:18,sizeCompare:'greater'});
 fireEvent.change(screen.getByLabelText('查找字号'),{target:{value:'broken'}});fireEvent.click(screen.getByText('查找'));await screen.findByRole('alert');expect(editDocument).toHaveBeenCalledOnce();
});
it('combined object criteria retain the explicit scope and numeric bounds',async()=>{
 const {workspace,editDocument}=setup();render(<EditorSelectionPanel workspace={workspace}/>);
 fireEvent.click(screen.getByText('当前图层'));fireEvent.click(screen.getByLabelText('填充色'));fireEvent.click(screen.getByLabelText('轮廓粗细'));fireEvent.change(screen.getByLabelText('筛选宽度'),{target:{value:'40'}});fireEvent.click(screen.getByText('小于'));fireEvent.click(screen.getByText('查找'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'object-search',scope:'layer',same:['fill','strokeWidth'],width:40,sizeCompare:'less',excludeGroups:true});
});
