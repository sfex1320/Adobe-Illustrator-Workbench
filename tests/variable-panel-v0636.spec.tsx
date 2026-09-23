// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {Workspace} from '@aiq/core';
import type {EditorAction,EditorResult,EditorState,VariableTemplate} from '@aiq/contracts';
import {VariableDataPanel} from '../packages/modules/variable-data/src/VariableDataPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const template:VariableTemplate={token:'template',docSessionId:'source',docName:'模板稿',boardName:'名片',boardIndex:1,width:200,height:100,objectCount:2,characterStyles:[],graphicStyles:[],targets:[{id:'t0',name:'姓名',kind:'TextFrame',text:'姓名占位文字',width:80,height:20},{id:'t1',name:'照片矩形',kind:'PathItem',rectangle:true,width:60,height:60}]};
function setup(){
 const state:EditorState={token:'fresh',docSessionId:'source',selectionKey:'selected',unsaved:true,objects:[],bounds:null,activeArtboard:0,artboards:[{index:0,name:'不处理',bounds:[0,0,200,100]},{index:1,name:'名片',bounds:[220,0,420,100]}],textSelection:false,symmetryPreview:false,capturedTargets:0};
 const read=vi.fn(async()=>state),edit=vi.fn(async(_s:EditorState,a:EditorAction):Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],...(a.type==='variable-data'&&a.operation==='capture'?{variableTemplate:template}:{}),...(a.type==='variable-data'&&a.operation==='bind-selection'?{variableTargetId:'t0'}:{}),...(a.type==='variable-data'&&a.operation==='images'?{folder:'C:/图片',files:['C:/图片/张三.png']}:{}),...(a.type==='variable-data'&&a.operation==='generate'?{variableRows:[{row:2,status:'completed' as const}]}:{})}));
 const workspace={getEditorState:()=>state,readEditorState:read,editDocument:edit,getSettings:()=>({liveEditorSync:false}),updateSettings:vi.fn(),chooseFolder:vi.fn(async()=> 'C:/图片')} as unknown as Workspace;
 class WorkerMock { onmessage:((event:MessageEvent)=>void)|null=null;onerror:null=null;terminate(){}postMessage(payload:{direction:string}){const labels=payload.direction==='column'?['A · 姓名','B · 编号']:['A · 姓名','B · 图片'];this.onmessage?.({data:{table:{sheet:'CSV',sheets:['CSV'],columns:labels.map((label,i)=>({id:i?'B':'A',label})),rows:[{row:2,cells:{A:{text:'张三',runs:[{text:'张三',bold:false}]},B:{text:'张三.png',runs:[{text:'张三.png',bold:false}]}}}],warnings:[]}}} as MessageEvent);}}
 vi.stubGlobal('Worker',WorkerMock);return {workspace,read,edit};
}
async function importData(){const file=new File(['姓名,图片\n张三,张三.png'],'data.csv');Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(10)});fireEvent.change(screen.getByLabelText('导入可变数据表格'),{target:{files:[file]}});await screen.findByRole('columnheader',{name:'A · 姓名'});}
it('loads without host reads; captures an explicit board, binds actual selection and sends independent layout settings',async()=>{
 const {workspace,read,edit}=setup();render(<VariableDataPanel workspace={workspace}/>);expect(read).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'将所选画板记为模板'})).toBeDisabled();await importData();
 fireEvent.change(screen.getByLabelText('模板画板'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'将所选画板记为模板'}));
 await waitFor(()=>expect(edit).toHaveBeenCalledWith(expect.anything(),{type:'variable-data',operation:'capture',artboardIndex:1},expect.anything()));
 fireEvent.click(screen.getByRole('button',{name:'绑定画布所选对象'}));await screen.findByText('绑定 1');expect(edit.mock.calls[1]?.[1]).toMatchObject({operation:'bind-selection',templateToken:'template'});
 fireEvent.change(screen.getByLabelText('可变数据列容量'),{target:{value:''}});expect(screen.getByLabelText('可变数据列容量')).toHaveValue(null);expect(screen.getByLabelText('可变数据行容量')).toHaveValue(10);expect(screen.getByRole('button',{name:'生成 1 个画板'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('可变数据列容量'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('可变数据行容量'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('可变数据横向间距'),{target:{value:'12'}});fireEvent.change(screen.getByLabelText('可变数据纵向间距'),{target:{value:'7'}});
 fireEvent.click(screen.getByRole('button',{name:'生成 1 个画板'}));await waitFor(()=>expect(edit).toHaveBeenCalledTimes(3));
 expect(edit.mock.calls[2]?.[1]).toMatchObject({operation:'generate',columns:2,rowsPerBlock:3,horizontalGap:12*72/25.4,verticalGap:7*72/25.4,bindings:[{targetId:'t0',column:'A',style:'template'}]});
});
it('imports directory using the real picker interface and reimports when choosing first-column titles',async()=>{
 const {workspace,edit}=setup();render(<VariableDataPanel workspace={workspace}/>);await importData();
 fireEvent.change(screen.getByLabelText('表格标题方向'),{target:{value:'column'}});await screen.findByRole('columnheader',{name:'B · 编号'});
 fireEvent.click(screen.getByRole('button',{name:'导入图片目录'}));await screen.findByText('1 张图片 · 按名称匹配');
 expect(workspace.chooseFolder).toHaveBeenCalledOnce();expect(edit.mock.calls[0]?.[1]).toEqual({type:'variable-data',operation:'images',folder:'C:/图片'});
});
