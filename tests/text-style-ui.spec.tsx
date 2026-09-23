// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {EditorAction,EditorResult,EditorState} from '@aiq/contracts';
import type {EditorPort} from '../packages/ui/src/editor';
import {TextSearch} from '@aiq/ui';
afterEach(cleanup);
function setup(){
 const state={token:'editor',docSessionId:'doc',selectionKey:'s',unsaved:true,textSelection:false,symmetryPreview:false,capturedTargets:0,activeArtboard:0,objects:[],bounds:null,artboards:[]} as EditorState;
 const editDocument=vi.fn(async(_s:EditorState,a:EditorAction):Promise<EditorResult>=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],...(a.type==='fonts'?{fonts:[{name:'A-Regular',family:'A',style:'Regular'},{name:'A-Bold',family:'A',style:'Bold'},{name:'B-Regular',family:'B',style:'Regular'}]}:{}),...(a.type==='text-search'&&a.operation==='find'?{matchCount:1,searchToken:'found',matches:[{index:0,preview:'命中',count:1}]}:{})}));
 const workspace={getEditorState:()=>state,readEditorState:async()=>state,editDocument} as EditorPort;return {workspace,editDocument};
}
it('selects actual font families and applies only enabled style properties using the found token',async()=>{
 const {workspace,editDocument}=setup();render(<TextSearch workspace={workspace} fontMode/>);
 expect(screen.getByText('字体样式替换')).toBeInTheDocument();
 fireEvent.click(screen.getByText('加载字体库'));await screen.findByRole('option',{name:'A'});
 fireEvent.change(screen.getByLabelText('查找字体'),{target:{value:'A'}});fireEvent.change(screen.getByLabelText('查找款式'),{target:{value:'Bold'}});
 fireEvent.change(screen.getByLabelText('查找文字内容'),{target:{value:'字'}});
 fireEvent.click(screen.getByLabelText('替换字号'));fireEvent.change(screen.getByLabelText('替换字号 pt'),{target:{value:'24'}});
 fireEvent.click(screen.getByLabelText('替换填色'));fireEvent.change(screen.getByLabelText('替换填色色彩模式'),{target:{value:'cmyk'}});
 fireEvent.change(screen.getByLabelText('替换填色 K'),{target:{value:'100'}});
 fireEvent.click(screen.getByText('查找'));await screen.findByLabelText('勾选第 1 处');fireEvent.click(screen.getByLabelText('勾选第 1 处'));fireEvent.click(screen.getByText('替换勾选项'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(3));
 expect(editDocument.mock.calls[2]?.[1]).toMatchObject({operation:'replace-style',replacementSize:24,replacementFill:{kind:'cmyk',values:[0,0,0,100]},font:'A',fontStyle:'Bold',query:'字',searchToken:'found',matchIndexes:[0]});
 expect(editDocument.mock.calls[2]?.[1]).not.toHaveProperty('replacementFamily');
});
it('fill-only conditions can search, and editing color conditions immediately invalidates hits',async()=>{
 const {workspace,editDocument}=setup();render(<TextSearch workspace={workspace} fontMode/>);
 fireEvent.click(screen.getByLabelText('匹配填色'));fireEvent.change(screen.getByLabelText('查找填色 R'),{target:{value:'255'}});fireEvent.click(screen.getByText('查找'));
 await screen.findByLabelText('勾选第 1 处');expect(editDocument.mock.calls[0]?.[1]).toMatchObject({textFill:{kind:'rgb',values:[255,0,0]}});
 fireEvent.change(screen.getByLabelText('查找填色 R'),{target:{value:'25.'}});expect(screen.getByLabelText('查找填色 R')).toHaveValue('25.');expect(screen.queryByText('替换全部匹配')).not.toBeInTheDocument();
});
