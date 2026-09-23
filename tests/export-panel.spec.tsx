// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Workspace } from '@aiq/core';
import { DEFAULT_APP_SETTINGS, type AppSettings, type EditorState, type EditorResult } from '@aiq/contracts';
import { EditorExportPanel } from '../packages/modules/export/src/EditorExportPanel.js';

afterEach(cleanup);
it('makes automatic versus always-independent rendering explicit and preserves the existing preference',async()=>{
 const {workspace,editDocument}=setup({exportPreferences:{target:'artboards',rasterIndependent:false,dpi:'150'}});
 expect(screen.getByLabelText('渲染器')).toHaveValue('auto');
 fireEvent.change(screen.getByLabelText('渲染器'),{target:{value:'independent'}});
 expect(workspace.getSettings().exportPreferences?.rasterIndependent).toBe(true);
 fireEvent.click(screen.getByText('导出 1 画板'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());expect(editDocument.mock.calls[0]?.[1]).toMatchObject({rasterEngine:'independent',resolution:150,scale:100});
});
it('persists edge quality without changing the multiplier or PPI',async()=>{
 const {workspace,editDocument}=setup({exportPreferences:{target:'artboards',rasterIndependent:true,dpi:'150'},exportScale:1000});
 expect(screen.getByLabelText('边缘平滑')).toHaveValue('high');
 expect(screen.getByLabelText('专色转为画面近似色')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('专色转为画面近似色'));
 fireEvent.change(screen.getByLabelText('边缘平滑'),{target:{value:'standard'}});
 fireEvent.click(screen.getByText('导出 1 画板'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({rasterSmoothing:'standard',rasterConvertSpots:true,resolution:150,scale:1000});
 expect(workspace.getSettings().exportFormatPreferences?.png?.rasterSmoothing).toBe('standard');
});
it('offers explicit PSD layers and leaves TIFF flat unless Photoshop layers are requested',async()=>{
 const {editDocument}=setup();fireEvent.click(screen.getByText('PSD'));
 expect(screen.getByLabelText('保留 PSD 图层')).toBeChecked();
 fireEvent.click(screen.getByLabelText('保留 PSD 图层'));fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({writeLayers:false});
 fireEvent.click(screen.getByText('TIF'));expect(screen.getByTitle(/当前 TIF 输出为合并图像/)).toBeVisible();
 expect(screen.getByLabelText('保留 TIF 图层（需要 Photoshop）')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('保留 TIF 图层（需要 Photoshop）'));
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));
 expect(editDocument.mock.calls[1]?.[1]).toMatchObject({format:'tif',writeLayers:true,rasterEngine:undefined});
});
it('restores legacy percent settings as multipliers and converts a fractional multiplier once',async()=>{
 const {editDocument,workspace}=setup({exportScale:1000});
 expect(screen.getByLabelText('导出缩放')).toHaveValue('10');
 fireEvent.change(screen.getByLabelText('导出缩放'),{target:{value:'0.1'}});
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({scale:10});
 expect(workspace.getSettings().exportScale).toBe(10);
});
it('persists AI PDF compatibility independently of PDF editability and sends false unchanged',async()=>{
 const {editDocument,workspace,view}=setup();
 fireEvent.click(screen.getByText('AI'));expect(screen.getByLabelText('创建 PDF 兼容文件')).toBeChecked();
 fireEvent.click(screen.getByLabelText('创建 PDF 兼容文件'));
 fireEvent.click(screen.getByText('PDF'));fireEvent.click(screen.getByLabelText('保留 Illustrator 编辑能力'));
 fireEvent.click(screen.getByText('AI'));expect(screen.getByLabelText('创建 PDF 兼容文件')).not.toBeChecked();
 view.unmount();render(<EditorExportPanel workspace={workspace}/>);
 expect(screen.getByLabelText('创建 PDF 兼容文件')).not.toBeChecked();
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledOnce());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({format:'ai',pdfCompatible:false});
 fireEvent.click(screen.getByText('PDF'));expect(screen.getByLabelText('保留 Illustrator 编辑能力')).toBeChecked();
});
function setup(patch: Partial<AppSettings> = {}) {
 let settings: AppSettings = { ...DEFAULT_APP_SETTINGS, exportFolder: 'C:/exports', ...patch };
 const state = { token: 'one', docSessionId: 'doc', rulerUnit: 'mm', sourceFolder: 'C:/source', colorSpace: 'rgb', objects: [{ id: 'shape' }], artboards: [{ index: 0, name: 'A', bounds: [0, 0, 100, 80] }], activeArtboard: 0 } as EditorState;
 const editDocument = vi.fn(async (_state: EditorState, action: { type: string }):Promise<EditorResult> => action.type === 'choose-folder'
   ? { status: 'completed', folder: 'D:/chosen', selectedObjectIds: [], skipped: [], sideEffects: [] }
   : { status: 'completed', files: ['out.pdf'], selectedObjectIds: [], skipped: [], sideEffects: [] });
 const workspace = { getSettings: () => settings, updateSettings: (value: Partial<AppSettings>) => { settings = { ...settings, ...value }; }, getEditorState: () => state, readEditorState: async () => state, editDocument } as unknown as Workspace;
 const view = render(<EditorExportPanel workspace={workspace} />);
 return { workspace, editDocument, state, view };
}
it('records complete addresses after successful export, not on every keystroke', async () => {
 const { workspace } = setup();
 fireEvent.change(screen.getByLabelText('项目导出目录'), { target: { value: 'D:/new output' } });
 expect(workspace.getSettings().exportFolders).toBeUndefined();
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(() => expect(workspace.getSettings().exportFolders).toEqual(['D:/new output']));
});
it('does not add a failed export destination to recent directories', async () => {
 const { workspace, editDocument } = setup();
 editDocument.mockResolvedValueOnce({ status: 'failed', selectedObjectIds: [], skipped: [], sideEffects: [], files: [] });
 fireEvent.click(screen.getByText('导出所选'));
 await screen.findByRole('alert');
 expect(workspace.getSettings().exportFolders).toBeUndefined();
});
it('records a partial export only when it actually produced files', async () => {
 const { workspace, editDocument } = setup();
 editDocument.mockResolvedValueOnce({ status: 'partial', selectedObjectIds: [], skipped: [], sideEffects: [], files: ['first.png'] });
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(() => expect(workspace.getSettings().exportFolders).toEqual(['C:/exports']));
});
it('switches from source directory to a recent address and persists favorites', () => {
 const { workspace } = setup({ exportAlongsideSource: true, exportFolders: ['D:/recent'] });
 fireEvent.click(screen.getByLabelText('最近或收藏目录'));
 expect(screen.getAllByText('C:/source').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByLabelText('收藏 C:/source'));
 expect(workspace.getSettings().exportFavorites).toEqual(['C:/source']);
 fireEvent.click(screen.getByText('收藏'));
 fireEvent.click(screen.getByLabelText('取消收藏 C:/source'));
 expect(workspace.getSettings().exportFavorites).toEqual([]);
 fireEvent.click(screen.getByText('最近'));
 fireEvent.click(screen.getByText('D:/recent'));
 expect(workspace.getSettings().exportAlongsideSource).toBe(false);
 expect((screen.getByLabelText('项目导出目录') as HTMLInputElement).value).toBe('D:/recent');
});
it('chooses a directory manually while source following is enabled', async () => {
 const { workspace } = setup({ exportAlongsideSource: true });
 fireEvent.click(screen.getByText('浏览'));
 await waitFor(() => expect(workspace.getSettings().exportFolder).toBe('D:/chosen'));
 expect(workspace.getSettings().exportAlongsideSource).toBe(false);
});
it('passes subfolder and CMYK to the shared editor action', async () => {
 const { editDocument } = setup();
 fireEvent.click(screen.getByText('PDF'));
 fireEvent.change(screen.getByLabelText('导出颜色模式'), { target: { value: 'cmyk' } });
 fireEvent.click(screen.getByText('建立子目录'));
 fireEvent.change(screen.getByLabelText('子目录名称'), { target: { value: '交付' } });
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(() => expect(editDocument).toHaveBeenCalled());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({ createSubfolder: true, subfolderName: '交付', colorMode: 'cmyk', target: 'objects' });
});
it('shows bleed outside collapsed settings and validates in points once', async () => {
 const { editDocument } = setup();
 fireEvent.click(screen.getByRole('button',{name:'指定画板'}));
 fireEvent.click(screen.getByText('使用出血'));
 expect(screen.getByLabelText('出血量').closest('details')).toBeNull();
 fireEvent.change(screen.getByLabelText('出血量'), { target: { value: '200' } });
 fireEvent.click(screen.getByText('导出 1 画板'));
 await waitFor(() => expect(editDocument).toHaveBeenCalled());
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({ useDocumentBleed: true, bleedPoints: 200 * 72 / 25.4 });
});
it('allows native CMYK JPEG and keeps actions outside scrollable settings', () => {
 setup();
 fireEvent.click(screen.getByText('PDF'));
 fireEvent.change(screen.getByLabelText('导出颜色模式'), { target: { value: 'cmyk' } });
 fireEvent.click(screen.getByText('JPEG'));
 const color = screen.getByLabelText('导出颜色模式') as HTMLSelectElement;
 expect(color.value).toBe('cmyk'); expect(color.disabled).toBe(false);
 fireEvent.click(screen.getByText('PNG'));expect(color.value).toBe('rgb');expect(color.disabled).toBe(true);
 expect(screen.getByText('导出所选').closest('.wb-export-scroll')).toBeNull();
});

it('sends reordered naming blocks, precision and real scale in one export command',async()=>{
 const {editDocument,workspace}=setup();
 fireEvent.click(screen.getByLabelText('命名要求'));
 fireEvent.click(screen.getByLabelText('使用命名块'));
 fireEvent.click(screen.getByLabelText('命名块 尺寸'));
 fireEvent.click(screen.getByLabelText('命名块 材质'));
 fireEvent.change(screen.getByLabelText('材质内容'),{target:{value:'157g铜版纸'}});
 fireEvent.change(screen.getByLabelText('尺寸小数位'),{target:{value:'3'}});
 fireEvent.change(screen.getByLabelText('名称来源'),{target:{value:'custom'}});
 fireEvent.change(screen.getByLabelText('名称块内容'),{target:{value:'成品'}});
 fireEvent.click(screen.getByLabelText('上移名称'));
 fireEvent.change(screen.getByLabelText('导出缩放'),{target:{value:'100'}});
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(1));
 expect(editDocument.mock.calls[0]?.[1]).toMatchObject({scale:10000,naming:{enabled:true,nameSource:'custom',decimals:3,blocks:[{kind:'remark'},{kind:'material',value:'157g铜版纸'},{kind:'name',value:'成品'},{kind:'size'},{kind:'customer'},{kind:'bleed'}]}});
 expect(workspace.getSettings().exportScale).toBe(10000);
 expect(workspace.getSettings().exportNaming?.blocks[2]?.kind).toBe('name');
});
it('opens the actual output subfolder after export, then follows a changed address',async()=>{
 const {editDocument}=setup();
 editDocument.mockResolvedValueOnce({status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],files:['out.png'],folder:'C:/exports/交付'});
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(screen.getByText('打开')).not.toBeDisabled());
 fireEvent.click(screen.getByText('打开'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(2));
 expect(editDocument.mock.calls[1]?.[1]).toEqual({type:'open-folder',folder:'C:/exports/交付'});
 fireEvent.change(screen.getByLabelText('项目导出目录'),{target:{value:'D:/other'}});
 await waitFor(()=>expect(screen.getByText('打开')).not.toBeDisabled());
 fireEvent.click(screen.getByText('打开'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalledTimes(3));
 expect(editDocument.mock.calls[2]?.[1]).toEqual({type:'open-folder',folder:'D:/other'});
});
it('rejects invalid scale before entering Illustrator',async()=>{
 const {editDocument}=setup();fireEvent.change(screen.getByLabelText('导出缩放'),{target:{value:'0'}});fireEvent.click(screen.getByText('导出所选'));
 await screen.findByRole('alert');expect(editDocument).not.toHaveBeenCalled();
});
it('offers the eight requested resolutions and restores unsent preferences after remount',()=>{
 const {workspace,view}=setup();
 fireEvent.click(screen.getByLabelText('导出分辨率预选'));
 expect(Array.from(screen.getByRole('listbox').querySelectorAll('[role=option]')).map(o=>o.textContent)).toEqual(['50','72','100','150','200','300','400','600']);
 fireEvent.change(screen.getByLabelText('导出分辨率'),{target:{value:'150'}});
 fireEvent.click(screen.getByText('PDF'));
 fireEvent.change(screen.getByLabelText('导出颜色模式'),{target:{value:'cmyk'}});
 fireEvent.click(screen.getByLabelText('导出副本文字转曲'));
 fireEvent.click(screen.getByLabelText('纯黑叠印'));
 fireEvent.click(screen.getByText('保留 Illustrator 编辑能力'));
 for(const label of ['无损压缩','导出副本文字转曲','纯黑叠印'])expect(screen.getByLabelText(label).closest('details')).toBeNull();
 view.unmount();render(<EditorExportPanel workspace={workspace}/>);
 expect(screen.getByLabelText('导出分辨率')).toHaveValue('150');
 expect(screen.getByLabelText('导出副本文字转曲')).toBeChecked();
 expect(screen.getByLabelText('纯黑叠印')).toBeChecked();
 expect(workspace.getSettings().exportPreferences).toMatchObject({format:'pdf',dpi:'150',editable:true});
});
it('naming popup opens from a single bar and Escape closes it and restores focus',()=>{
 setup();expect(screen.queryByRole('dialog',{name:'命名块设置'})).toBeNull();
 fireEvent.click(screen.getByLabelText('命名要求'));expect(screen.getByRole('dialog',{name:'命名块设置'})).toBeInTheDocument();
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'命名块设置'})).toBeNull();expect(screen.getByLabelText('命名要求')).toHaveFocus();
});
it('restores export scope preference without reusing old artboard indexes',()=>{
 // 0.6.29：恢复范围偏好时导出画板跟随当前活动画板／画板工具多选，不复用旧文档的画板编号。
 setup({exportPreferences:{target:'artboards',format:'jpeg'}});
 expect(screen.getByText('导出 1 画板')).toBeEnabled();
 expect(screen.queryByText(/防黑/)).toBeNull();
});
it('remembers JPEG and PDF resolutions independently',()=>{
 setup();fireEvent.click(screen.getByText('JPEG'));fireEvent.change(screen.getByLabelText('导出分辨率'),{target:{value:'100'}});
 fireEvent.click(screen.getByText('PDF'));fireEvent.change(screen.getByLabelText('导出分辨率'),{target:{value:'400'}});
 fireEvent.click(screen.getByText('JPEG'));expect(screen.getByLabelText('导出分辨率')).toHaveValue('100');
 fireEvent.click(screen.getByText('PDF'));expect(screen.getByLabelText('导出分辨率')).toHaveValue('400');
});
it('sends cancellation through the status port while the export action is still running',async()=>{
 const {workspace,editDocument}=setup();
 workspace.supportsExportProgress=()=>true;
 workspace.readExportProgress=async jobId=>({jobId,total:70,current:3,completed:2,failed:0,status:'running',completedIndexes:[0,1]});
 workspace.cancelExport=vi.fn(async()=>{});
 let finish!:(value:EditorResult)=>void;editDocument.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 fireEvent.click(screen.getByText('导出所选'));
 await waitFor(()=>expect(editDocument).toHaveBeenCalled());
 fireEvent.click(screen.getByText('取消后续导出'));
 expect(workspace.cancelExport).toHaveBeenCalledWith(workspace.getSettings().lastExportJobId);
 expect(screen.getByText('已请求取消，等待安全检查点')).toBeDisabled();
 finish({status:'partial',files:['page1.jpg'],selectedObjectIds:[],skipped:[],sideEffects:[]});
 await waitFor(()=>expect(screen.queryByText('已请求取消，等待安全检查点')).toBeNull());
});

it('selects the editable resolution on focus and rejects invalid values before host work', async () => {
 const { editDocument }=setup();const input=screen.getByLabelText('导出分辨率') as HTMLInputElement;
 fireEvent.focus(input);expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(3);
 fireEvent.change(input,{target:{value:'abc'}});fireEvent.click(screen.getByText('导出所选'));
 expect(await screen.findByRole('alert')).toHaveTextContent('分辨率');expect(editDocument).not.toHaveBeenCalled();
});
it('offers raster TIF and PSD and keeps the compact PPI label', () => {
 setup();fireEvent.click(screen.getByText('TIF'));expect(screen.getByText('PPI')).toBeInTheDocument();
 fireEvent.click(screen.getByText('PSD'));expect(screen.getByTitle(/复杂外观可能合并或栅格化/)).toBeInTheDocument();
 fireEvent.click(screen.getByText('PDF'));expect(screen.getByText('PPI')).toBeInTheDocument();
});
it('screen preset explicitly selects RGB and 72 PPI while retaining manual PPI edits',async()=>{
 const {editDocument}=setup({exportPreferences:{target:'artboards',format:'jpeg',colorMode:'cmyk',dpi:'300'}});
 fireEvent.click(screen.getByLabelText('屏幕导出'));
 expect(screen.getByLabelText('导出分辨率')).toHaveValue('72');
 expect(screen.getByLabelText('导出颜色模式')).toHaveValue('rgb');
 fireEvent.change(screen.getByLabelText('导出分辨率'),{target:{value:'150'}});
 fireEvent.click(screen.getByLabelText('屏幕导出'));
 expect(screen.getByLabelText('导出颜色模式')).toHaveValue('cmyk');
 expect(screen.getByLabelText('导出分辨率')).toHaveValue('150');
 expect(editDocument).not.toHaveBeenCalled();
});
