// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Arrangement} from '../packages/ui/src/Arrangement';
import {EditorSizePanel} from '../packages/modules/size-align/src/EditorSizePanel';
import {ArtboardPanel} from '../packages/modules/artboards/src/ArtboardPanel';
import type {AppSettings,EditorAction,EditorResult,EditorState} from '@aiq/contracts';
import type {Workspace} from '@aiq/core';
afterEach(cleanup);
const object=(id:string,x:number)=>({id,kind:'path',bounds:[x,0,x+10,10] as [number,number,number,number],fill:null,stroke:null,strokeWidth:null,font:null,fontSize:null});
function setup(){
 let state:EditorState={token:'initial',docSessionId:'doc',selectionKey:'selected',unsaved:true,textSelection:false,symmetryPreview:false,capturedTargets:0,rulerUnit:'pt',activeArtboard:0,bounds:[0,0,50,10],objects:[object('s0',0),object('s1',40)],artboards:[0,1,2,3].map(index=>({index,name:'画板'+index,bounds:[index*40,0,index*40+20,20]}))};
 let settings:Partial<AppSettings>={liveEditorSync:false};
 const read=vi.fn(async()=>state),edit=vi.fn(async(s:EditorState,a:EditorAction):Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],...(a.type==='measure-layout'?{measuredObjects:s.objects.map(o=>({...o,bounds:[o.bounds[0]+2,2,o.bounds[2]-2,8]}))}:{})}));
 const workspace={getEditorState:()=>state,readEditorState:read,editDocument:edit,getSettings:()=>settings,updateSettings:(patch:Partial<AppSettings>)=>{settings={...settings,...patch};},hasUndoableWrite:()=>false} as unknown as Workspace;
 return {workspace,read,edit,set:(patch:Partial<EditorState>)=>{state={...state,...patch};}};
}
it('previews locally, exposes Z/N flow and saves presets without document references',()=>{
 const {workspace,read,edit}=setup(),apply=vi.fn();
 render(<Arrangement workspace={workspace} busy={false} unit="pt" items={[object('s0',0),object('s1',40)]} anchorOptions={[["s0","对象 1"],["s1","对象 2"]]} onArrange={apply}/>);
 expect(screen.getByRole('img',{name:'排列示意图'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('排列顺序'),{target:{value:'vertical'}});
 expect(screen.getByRole('option',{name:'横排 Z 字型'})).toBeInTheDocument();expect(screen.getByRole('option',{name:'竖排 N 字型'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('排列预设名称'),{target:{value:'两列样张'}});fireEvent.click(screen.getByText('保存预设'));
 expect(JSON.stringify(workspace.getSettings().toolPreferences)).not.toContain('s0');
 expect(read).not.toHaveBeenCalled();expect(edit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('排列'));expect(apply).toHaveBeenCalledWith(expect.objectContaining({order:'vertical',position:'selection'}),true);
});
it('does not render meaningless explicit target controls for an empty selection',()=>{
 const {workspace,set}=setup();set({objects:[],bounds:null});render(<EditorSizePanel workspace={workspace}/>);
 expect(screen.queryByText('指定目标')).not.toBeInTheDocument();
});
it('arrangement measures fresh selection then maps glyph bounds through shared geometry',async()=>{
 const {workspace,set,read,edit}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.click(screen.getByLabelText('对齐字形边界'));
 set({token:'fresh',objects:[object('s0',40),object('s1',0)]});
 fireEvent.change(screen.getByLabelText('列数'),{target:{value:'2'}});fireEvent.click(screen.getByText('排列'));
 await waitFor(()=>expect(edit).toHaveBeenCalledTimes(2));
 expect(read).toHaveBeenCalledOnce();expect(edit.mock.calls[0]?.[1]).toMatchObject({type:'measure-layout',text:'glyph'});
 expect(edit.mock.calls[1]?.[0].token).toBe('fresh');expect(edit.mock.calls[1]?.[1]).toMatchObject({type:'geometry',transforms:[{id:'s1'},{id:'s0'}]});
});
it('rejects changed selection when it invalidates an explicit anchor',async()=>{
 const {workspace,set,edit}=setup();render(<EditorSizePanel workspace={workspace}/>);
 fireEvent.change(screen.getByLabelText('排列定位'),{target:{value:'anchor'}});set({selectionKey:'changed'});
 fireEvent.click(screen.getByText('排列'));expect(await screen.findByRole('alert')).toHaveTextContent('选区已改变');expect(edit).not.toHaveBeenCalled();
});
it('measurement failures do not produce any geometry write',async()=>{
 const {workspace,edit}=setup();edit.mockImplementation(async()=>({status:'failed',selectedObjectIds:[],skipped:[],sideEffects:[],error:{code:'HOST_SCRIPT_ERROR',message:'曲线蒙版不可测量'}}));
 render(<EditorSizePanel workspace={workspace}/>);fireEvent.click(screen.getByText('排列'));
 expect(await screen.findByRole('alert')).toHaveTextContent('曲线蒙版不可测量');expect(edit).toHaveBeenCalledOnce();expect(edit.mock.calls[0]?.[1].type).toBe('measure-layout');
});
it('changing document units converts gap and width drafts without host calls or preset references',()=>{
 const {workspace,read}=setup(),props={workspace,busy:false,unit:'mm',items:[object('s0',0)],anchorOptions:[["s0","对象 1"]] as Array<[string,string]>,onArrange:vi.fn()};
 const panel=render(<Arrangement {...props}/>);fireEvent.change(screen.getByLabelText('列间距 mm'),{target:{value:'25.4'}});
 fireEvent.change(screen.getByLabelText('排列尺寸'),{target:{value:'width'}});fireEvent.change(screen.getByLabelText('排列固定总宽'),{target:{value:'50.8'}});
 panel.rerender(<Arrangement {...props} unit="in"/>);expect(screen.getByLabelText('列间距 in')).toHaveValue('1');expect(screen.getByLabelText('排列固定总宽')).toHaveValue('2');expect(read).not.toHaveBeenCalled();
});
it('board odd/even range is recomputed from fresh spatial order when applying',async()=>{
 const {workspace,set,edit}=setup();render(<ArtboardPanel workspace={workspace}/>);
 const scope=screen.getByRole('group',{name:'排列画板范围'});fireEvent.click([...scope.querySelectorAll('button')].find(b=>b.textContent==='单数')!);
 set({artboards:[{index:0,name:'0',bounds:[120,0,140,20]},{index:1,name:'1',bounds:[0,0,20,20]},{index:2,name:'2',bounds:[40,0,60,20]},{index:3,name:'3',bounds:[80,0,100,20]}]});
 fireEvent.click(screen.getByText('排列'));await waitFor(()=>expect(edit).toHaveBeenCalledOnce());
 expect(edit.mock.calls[0]?.[1]).toMatchObject({type:'artboards-update',boards:[{index:1},{index:3}]});
});
