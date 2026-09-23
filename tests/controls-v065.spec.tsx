// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {AppSettings,EditorAction,EditorResult,EditorState} from '@aiq/contracts';
import type {Workspace} from '@aiq/core';
import {EditorSizePanel} from '../packages/modules/size-align/src/EditorSizePanel';
import {ArtboardPanel} from '../packages/modules/artboards/src/ArtboardPanel';
import {AnnotationPanel} from '../packages/modules/annotation/src/AnnotationPanel';
import {EditorReplacePanel} from '../packages/modules/replace/src/EditorReplacePanel';
afterEach(cleanup);
it('calculates size expressions and refuses invalid arithmetic before writing',async()=>{
 const {workspace,editDocument}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'（１２＋８）÷２'}});
 fireEvent.click(screen.getByText('↔ 按宽应用'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({transforms:[{bounds:[0,0,10,20]}]});
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'1/0'}});fireEvent.click(screen.getByText('↔ 按宽应用'));
 expect(await screen.findByRole('alert')).toHaveTextContent('有效数字');expect(editDocument).toHaveBeenCalledOnce();
});
it('keeps first-click full selection across a unit conversion without selecting again on typing',()=>{
 const {workspace,change}=setup();render(<EditorSizePanel workspace={workspace}/>);
 const input=screen.getByLabelText('目标宽度') as HTMLInputElement;
 fireEvent.change(input,{target:{value:'72'}});input.focus();input.select();
 act(()=>change({rulerUnit:'mm'}));expect(input.value).toBe('25.4');expect([input.selectionStart,input.selectionEnd]).toEqual([0,4]);
 input.setSelectionRange(2,2);fireEvent.change(input,{target:{value:'251.4'}});
 expect(input.selectionStart).not.toBe(0);
});
it('right click aligns a single object to asymmetric artboard bleed and refuses unknown bleed',async()=>{
 const {workspace,editDocument,change}=setup();change({bleedOffsets:[2,3,7,11]});
 editDocument.mockImplementation(async(s,a)=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],...(a.type==='measure-layout'?{measuredObjects:s.objects}:{})}));
 render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.contextMenu(screen.getByRole('button',{name:'左上对齐'}));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));
 expect(editDocument.mock.calls[1]?.[1]).toMatchObject({type:'geometry',transforms:[{id:'s0',bounds:[-2,-3,8,17]}]});
 editDocument.mockClear();act(()=>change({bleedOffsets:null}));
 fireEvent.contextMenu(screen.getByRole('button',{name:'水平居中对齐'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('出血');
 expect(editDocument.mock.calls.filter(c=>c[1].type==='geometry')).toHaveLength(0);
});
it('annotation uses one color setting and refuses invalid color before document writes',async()=>{
 const {workspace,editDocument}=setup();render(<AnnotationPanel workspace={workspace}/>);
 fireEvent.click(screen.getByText('对象尺寸'));
 fireEvent.change(screen.getByLabelText('标注颜色'),{target:{value:'#a132ef'}});
 fireEvent.click(screen.getByText('生成标注'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'annotate',annotation:{color:'#a132ef'}});
 fireEvent.change(screen.getByLabelText('标注颜色'),{target:{value:'oops'}});
 fireEvent.click(screen.getByText('生成标注'));expect(await screen.findByRole('alert')).toHaveTextContent('标注颜色');
 expect(editDocument).toHaveBeenCalledOnce();
});
it('replacement text dropdown sends the selected proportional sizing rule',async()=>{
 const {workspace,editDocument,change}=setup();change({capturedSource:true});render(<EditorReplacePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('替换尺寸'),{target:{value:'height'}});
 fireEvent.click(screen.getByText('替换所选目标'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'replace',scaleMode:'height',removeTargets:true});
});
function setup(){
 let state:EditorState={token:'one',docSessionId:'d',selectionKey:'selected',unsaved:true,textSelection:false,symmetryPreview:false,capturedTargets:0,rulerUnit:'pt',activeArtboard:0,bounds:[0,0,10,20],objects:[{id:'s0',kind:'path',bounds:[0,0,10,20],fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null}],artboards:Array.from({length:4},(_,index)=>({index,name:'画板'+(index+1),bounds:[index*120,0,index*120+100,80]}))};
 let listener:((s:EditorState|null)=>void)|undefined;
 const editDocument=vi.fn(async(_s:EditorState,_a:EditorAction):Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[]}));
 let prefs:AppSettings['sizePreferences'];
 const workspace={getSettings:()=>({sizePreferences:prefs}),updateSettings:(patch:Partial<AppSettings>)=>{if(patch.sizePreferences)prefs=patch.sizePreferences;},getEditorState:()=>state,readEditorState:async()=>state,onEditorState:(fn:typeof listener)=>{listener=fn;return()=>{listener=undefined;};},editDocument,hasUndoableWrite:()=>false} as unknown as Workspace;
 return {workspace,editDocument,change:(patch:Partial<EditorState>)=>{state={...state,...patch};listener?.(state);}};
}
it('size drafts normalize to two trimmed decimals on blur; Apply Size uses both fields',async()=>{
 const {workspace,editDocument}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'12.3456'}});fireEvent.change(screen.getByLabelText('目标高度'),{target:{value:'30.9000'}});
 expect(screen.queryByRole('switch',{name:'宽度等比'})).not.toBeInTheDocument();
 expect(screen.getByLabelText('目标宽度')).toHaveValue('12.3456');fireEvent.blur(screen.getByLabelText('目标宽度'));fireEvent.blur(screen.getByLabelText('目标高度'));
 expect(screen.getByLabelText('目标宽度')).toHaveValue('12.35');expect(screen.getByLabelText('目标高度')).toHaveValue('30.9');
 fireEvent.click(screen.getByText('应用尺寸'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'geometry',transforms:[{bounds:[expect.closeTo(-1.175,8),expect.closeTo(-5.45,8),expect.closeTo(11.175,8),expect.closeTo(25.45,8)]}]});
 fireEvent.click(screen.getByRole('button',{name:'对象尺寸'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('10'));expect(screen.getByLabelText('目标高度')).toHaveValue('20');
});
it('changing active artboard updates its dimensions and current-only write target',async()=>{
 const {workspace,editDocument,change}=setup();render(<ArtboardPanel workspace={workspace}/>);
 act(()=>change({activeArtboard:2}));expect(screen.getAllByText('当前选中 1 个画板')[0]).toBeTruthy();
 fireEvent.change(screen.getByLabelText('画板宽'),{target:{value:'60.1256'}});fireEvent.click(screen.getByText('应用 1 个画板'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalled());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'artboards-update',boards:[{index:2,bounds:[expect.closeTo(259.9372,8),0,expect.closeTo(320.0628,8),80]}]});
});
it('arbitrary board multiselect applies only its explicitly selected indexes',async()=>{
 const {workspace,editDocument}=setup();render(<ArtboardPanel workspace={workspace}/>);
 fireEvent.click(screen.getByRole('group',{name:'画板操作范围'}).querySelector('button:last-child')!);const checks=screen.getAllByRole('checkbox').filter(e=>e.closest('.wb-board-grid'));expect(checks[0]).toBeChecked();fireEvent.click(checks[3]!);
 fireEvent.click(screen.getByText('应用 2 个画板'));await waitFor(()=>expect(editDocument).toHaveBeenCalled());const action=editDocument.mock.calls[0]?.[1];expect(action?.type).toBe('artboards-update');if(action?.type==='artboards-update')expect(action.boards.map(b=>b.index)).toEqual([0,3]);
});
it('annotation defaults follow newly active board and carry precision, note and auto font',async()=>{
 const {workspace,editDocument,change}=setup();render(<AnnotationPanel workspace={workspace}/>);act(()=>change({activeArtboard:3}));
 fireEvent.change(screen.getByLabelText('标注小数位数'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('标注备注'),{target:{value:'备注'}});fireEvent.click(screen.getByText('自动'));fireEvent.click(screen.getByText('生成标注'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalled());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'annotate',artboardIndexes:[3],annotation:{decimals:0,remark:'备注',autoFont:true}});
});

it('sampled dimensions survive new selections, boards, edits and panel remount',async()=>{
 const {workspace,change}=setup();const panel=render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.click(screen.getByRole('button',{name:'对象尺寸'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('10'));
 act(()=>change({selectionKey:'another',objects:[{id:'b',kind:'path',bounds:[0,0,200,300]}] as EditorState['objects']}));
 expect(screen.getByLabelText('目标宽度')).toHaveValue('10');
 fireEvent.click(screen.getByRole('button',{name:'画板尺寸'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('100'));
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'55'}});
 act(()=>change({activeArtboard:2,selectionKey:'empty',objects:[]}));expect(screen.getByLabelText('目标宽度')).toHaveValue('55');
 panel.unmount();render(<EditorSizePanel workspace={workspace}/>);expect(screen.getByLabelText('目标宽度')).toHaveValue('55');expect(screen.getByLabelText('目标高度')).toHaveValue('80');
});
it('one click applies the selected ratio to fresh targets without keeping a hidden direction',async()=>{
 const {workspace,editDocument,change}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'30'}});fireEvent.change(screen.getByLabelText('目标高度'),{target:{value:'40'}});
 fireEvent.click(screen.getByText('↔ 按宽应用'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({transforms:[{bounds:[-10,-20,20,40]}]});
 expect(workspace.getSettings().sizePreferences?.proportion).toBe(null);
 fireEvent.click(screen.getByText('应用尺寸'));await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));expect(editDocument.mock.calls[1]?.[1]).toMatchObject({transforms:[{bounds:[-10,-10,20,30]}]});
 editDocument.mockClear();
 act(()=>change({selectionKey:'new',objects:[{id:'b',kind:'path',bounds:[0,0,40,10]}] as EditorState['objects']}));
 fireEvent.click(screen.getByText('↕ 按高应用'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({transforms:[{id:'b',bounds:[-60,-15,100,25]}]});
});
it('artboard sampling uses automatically synchronized bleed without manual reads or saves',async()=>{
 const {workspace,editDocument}=setup();workspace.getDocumentBleed=()=>[2,3,5,7];
 render(<EditorSizePanel workspace={workspace}/>);fireEvent.click(screen.getByLabelText('画板尺寸包含文档出血'));expect(screen.queryByText('读取文档出血')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'画板尺寸'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('107'));expect(screen.getByLabelText('目标高度')).toHaveValue('90');
 expect(editDocument).not.toHaveBeenCalled();
 for(let i=0;i<2;i++){fireEvent.click(screen.getByRole('button',{name:'适配画板'}));await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(i+1));await waitFor(()=>expect(screen.getByRole('button',{name:'适配画板'})).not.toBeDisabled());}
 expect(editDocument.mock.calls.map(c=>c[1].type)).toEqual(['geometry','geometry']);
 expect(editDocument.mock.calls[1]?.[1]).toMatchObject({type:'geometry',transforms:[{bounds:[-48.5,-35,58.5,55]}]});
});
it('unknown bleed refuses fit without geometry; empty sampling preserves the saved dimensions',async()=>{
 const {workspace,editDocument,change}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'42'}});fireEvent.click(screen.getByLabelText('画板尺寸包含文档出血'));
 fireEvent.click(screen.getByRole('button',{name:'适配画板'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('当前文档出血不可用'));expect(editDocument).not.toHaveBeenCalled();
 act(()=>change({selectionKey:'empty',objects:[]}));fireEvent.click(screen.getByRole('button',{name:'对象尺寸'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('没有选择对象'));expect(screen.getByLabelText('目标宽度')).toHaveValue('42');
});

it('unit changes and automatic ruler changes preserve physical target dimensions',async()=>{
 const {workspace,editDocument,change}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'72'}});fireEvent.change(screen.getByLabelText('目标高度'),{target:{value:'144'}});
 act(()=>change({rulerUnit:'in',selectionKey:'new'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('1'));expect(screen.getByLabelText('目标高度')).toHaveValue('2');
 fireEvent.click(screen.getByText('应用尺寸'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({transforms:[{bounds:[-31,-62,41,82]}]});
});

it('restored targets keep their saved physical units before the first host state arrives',async()=>{
 const {workspace,editDocument,change}=setup();workspace.updateSettings({sizePreferences:{width:'72',height:'144',unit:'auto',valueUnit:'pt',proportion:null,together:'each',includeBleed:false}});
 workspace.getEditorState=()=>null;change({rulerUnit:'in'});
 render(<EditorSizePanel workspace={workspace}/>);expect(workspace.getSettings().sizePreferences?.valueUnit).toBe('pt');
 fireEvent.click(screen.getByText('应用尺寸'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({transforms:[{bounds:[-31,-62,41,82]}]});
 act(()=>change({rulerUnit:'in'}));await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('1'));expect(screen.getByLabelText('目标高度')).toHaveValue('2');
});

it('plain resize and artboard fit never read bleed even with stale cached data',async()=>{
 const {workspace,editDocument}=setup();workspace.getDocumentBleed=()=>[2,3,5,7];render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('目标宽度'),{target:{value:'30'}});fireEvent.change(screen.getByLabelText('目标高度'),{target:{value:'40'}});
 fireEvent.click(screen.getByText('应用尺寸'));await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 await waitFor(()=>expect(screen.getByRole('button',{name:'适配画板'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'适配画板'}));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));expect(editDocument.mock.calls.map(c=>c[1].type)).toEqual(['geometry','geometry']);
 expect(editDocument.mock.calls[1]?.[1]).toMatchObject({transforms:[{bounds:[-45,-30,55,50]}]});
});
