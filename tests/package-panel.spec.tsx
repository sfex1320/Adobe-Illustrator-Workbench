// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Workspace } from '@aiq/core';
import { DEFAULT_APP_SETTINGS, type EditorState, type EditorResult, type EditorAction } from '@aiq/contracts';
import { PackagePanel } from '../packages/modules/export/src/PackagePanel.js';
afterEach(cleanup);
function setup(){
 const state={token:'x',docSessionId:'doc',docName:'Test.ai',selectionKey:'none',rulerUnit:'mm',artboards:[],objects:[]} as unknown as EditorState;
 const editDocument=vi.fn(async(_state:EditorState,_action:EditorAction):Promise<EditorResult>=>({status:'completed',files:['Test.ai'],folder:'C:/outputs/Test-打包',selectedObjectIds:[],skipped:[],sideEffects:['file-export']}));
 const workspace={getSettings:()=>({...DEFAULT_APP_SETTINGS,exportFolder:'C:/outputs'}),updateSettings:vi.fn(),getEditorState:()=>state,readEditorState:vi.fn(async()=>state),editDocument} as unknown as Workspace;
 render(<PackagePanel workspace={workspace}/>);return {editDocument,workspace};
}
it('packages the whole document through the shared command with optional split attachments',async()=>{
 const {editDocument}=setup();fireEvent.click(screen.getByText('PDF 按画板拆分（不勾选生成合集）'));fireEvent.click(screen.getByText('画板附件保存到子文件夹'));
 fireEvent.change(screen.getByLabelText('打包缩放'),{target:{value:'10'}});
 fireEvent.change(screen.getByLabelText('规范说明文档'),{target:{value:'txt'}});fireEvent.click(screen.getByText('📦 一键打包'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'package',name:'Test-打包',outline:true,formats:['pdf'],splitPDF:true,report:'txt',outputSubfolder:'',scale:1000});
});
it('shows partial resource failures with the actual output directory',async()=>{
 const {editDocument}=setup();editDocument.mockResolvedValueOnce({status:'partial',files:['Test.ai'],folder:'C:/outputs/partial',selectedObjectIds:[],skipped:[{objectId:'link-1',reason:'链接文件缺失'}],sideEffects:['file-export']});
 fireEvent.click(screen.getByText('📦 一键打包'));expect(await screen.findByText('链接文件缺失')).toBeInTheDocument();fireEvent.click(screen.getByText('打开打包目录'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));expect(editDocument.mock.calls[1]?.[1]).toEqual({type:'open-folder',folder:'C:/outputs/partial'});
});
it('rejects invalid package scale before creating output',async()=>{
 const {editDocument}=setup();fireEvent.change(screen.getByLabelText('打包缩放'),{target:{value:'100000'}});fireEvent.click(screen.getByText('📦 一键打包'));
 expect(await screen.findByRole('alert')).toHaveTextContent('倍率');expect(editDocument).not.toHaveBeenCalled();
});

it('can disable AI PDF compatibility without disabling PDF attachments',async()=>{
 const {editDocument}=setup();expect(screen.getByLabelText('打包 AI 兼容 PDF')).toBeChecked();fireEvent.click(screen.getByLabelText('打包 AI 兼容 PDF'));fireEvent.click(screen.getByText('📦 一键打包'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({type:'package',pdfCompatible:false,formats:['pdf']});
});
