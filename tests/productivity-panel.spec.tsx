// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {Workspace} from '@aiq/core';
import {DEFAULT_APP_SETTINGS,type AppSettings,type EditorState} from '@aiq/contracts';
import {ProductivityPanel} from '../packages/modules/productivity/src/ProductivityPanel.js';

afterEach(cleanup);
function setup(options:Record<string,unknown>={}){
 let settings={...DEFAULT_APP_SETTINGS,toolPreferences:{'productivity.options':options}} as AppSettings;
 const shown={token:'1',docSessionId:'doc',rulerUnit:'mm',artboards:[{index:0,name:'A',bounds:[0,0,100,100]}]} as EditorState;
 let fresh:EditorState|null=shown;
 const editDocument=vi.fn(async()=>({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[]}));
 const workspace={getSettings:()=>settings,updateSettings:(patch:Partial<AppSettings>)=>{settings={...settings,...patch};},getEditorState:()=>shown,readEditorState:async()=>fresh,editDocument} as unknown as Workspace;
 render(<ProductivityPanel workspace={workspace}/>);
 return {shown,workspace,editDocument,setFresh:(s:EditorState|null)=>{fresh=s;}};
}
it('restores physical lengths in document units without overwriting settings on mount',()=>{
 const {workspace}=setup({valueUnit:'in',dx:'1',dy:'-1',removeOriginals:false});
 expect(screen.getByLabelText('水平偏移 mm')).toHaveValue('25.4');
 expect(workspace.getSettings().toolPreferences?.['productivity.options']).toMatchObject({valueUnit:'in',dx:'1'});
 fireEvent.change(screen.getByLabelText('水平偏移 mm'),{target:{value:'12.345'}});
 expect(screen.getByLabelText('水平偏移 mm')).toHaveValue('12.345');
 fireEvent.blur(screen.getByLabelText('水平偏移 mm'));
 expect(screen.getByLabelText('水平偏移 mm')).toHaveValue('12.35');
 expect(workspace.getSettings().toolPreferences?.['productivity.options']).toMatchObject({valueUnit:'mm',dy:'-25.4',removeOriginals:false});
});
it('blocks a prebuilt dimensional action if the fresh document unit differs',async()=>{
 const {shown,setFresh,editDocument}=setup();setFresh({...shown,rulerUnit:'in'});
 fireEvent.click(screen.getByText('填满蒙版'));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('文档单位已改变'));
 expect(editDocument).not.toHaveBeenCalled();
});
it('blocks checked board indexes after a fresh board change',async()=>{
 const {shown,setFresh,editDocument}=setup();
 fireEvent.change(screen.getByLabelText('生产辅助功能'),{target:{value:'duplicate-boards'}});
 fireEvent.click(screen.getByLabelText('画板 1 A'));
 setFresh({...shown,artboards:[{index:0,name:'Inserted board',bounds:[0,0,100,100]}]});
 fireEvent.click(screen.getByText('复制到勾选画板'));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('画板已改变'));
 expect(editDocument).not.toHaveBeenCalled();
});
it('shows an explicit error when a document disappears before execution',async()=>{
 const {setFresh,editDocument}=setup();setFresh(null);
 fireEvent.click(screen.getByText('填满蒙版'));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('没有可读取的文档'));
 expect(editDocument).not.toHaveBeenCalled();
});
