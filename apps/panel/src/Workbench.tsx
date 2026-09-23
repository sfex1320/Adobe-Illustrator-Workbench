import {UpdateSettings} from './UpdateSettings';
import { version as workbenchVersion } from '../../../package.json';
import {DataSettings} from './DataSettings';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ToolContribution } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { displayLength } from '@aiq/core';
import { NativeShortcuts } from './NativeShortcuts';
import { Button, Icon, ThemeProvider, useTheme, useEditor, useSelectAllOnFocus, StatusBar, EditorFeedback, TooltipLayer } from '@aiq/ui';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import type { DemoExtensions } from './App';
import type { DiscoveredModule } from './module-discovery';
import { toolCatalog } from './tool-catalog';
import { InlineScope as ScopeBar } from './InlineScope';
import { ResultsPanel } from './ResultsPanel';
import { CommandPalette } from './CommandPalette';
import { useWorkspaceTick } from './useWorkspaceTick';
import { resolveCepHostTheme } from './storage';
import {SidebarResize} from './SidebarResize';
import {usePanelDrag} from './usePanelDrag';
import type {CSSProperties} from 'react';

const resolveTheme = () => resolveCepHostTheme();
const NAV_LABELS: Record<string,string> = { artboards:'画板管理', selection:'查找选择', statistics:'文档统计', 'size-align':'尺寸对齐', annotation:'标注', 'text-write':'文字处理', replace:'批量替换', symmetry:'对称工具', export:'文件导出', preflight:'印前检查' };

export function Workbench({ workspace, discovered, demoExtensions }: { workspace: Workspace; discovered: DiscoveredModule[]; demoExtensions: DemoExtensions | null }) {
  useWorkspaceTick(workspace);
  useSelectAllOnFocus();
  const uiSize=workspace.getSettings().uiSize??'medium';
  const sidebarSide=workspace.getSettings().sidebarSide??'left',sidebarAutoHide=workspace.getSettings().sidebarAutoHide??false,sidebarLocked=workspace.getSettings().sidebarLocked??false;
  const [sidebarRevealed,setSidebarRevealed]=useState(false);
  const [sidebarWidth,setSidebarWidth]=useState(workspace.getSettings().sidebarWidth??78);
  useEffect(()=>{const timer=setTimeout(()=>{if(workspace.getSettings().sidebarWidth!==sidebarWidth)workspace.updateSettings({sidebarWidth});},200);return()=>clearTimeout(timer);},[sidebarWidth,workspace]);
  useLayoutEffect(()=>{document.documentElement.style.setProperty('--aiq-ui-scale',String(({small:.5,compact:.6,medium:.72,mediumPlus:.78,comfortable:.84,large:.96})[uiSize]));return()=>{document.documentElement.style.removeProperty('--aiq-ui-scale');};},[uiSize]);
  const [route, updateRoute] = useState(()=>{let saved=workspace.getSettings().workbenchView;if(saved?.group==='size-align'&&saved.tool==='artboards')saved={group:'artboards',tool:'artboards'};if(saved?.group==='size-align'&&saved.tool==='annotations')saved={group:'annotation',tool:'annotations'};if(!saved)return {group:'home',tool:''};if(['home','settings'].includes(saved.group))return saved;const entry=toolCatalog(workspace,discovered).find(g=>g.id===saved.group);return entry?{group:entry.id,tool:entry.tools.find(t=>t.id===saved.tool)?.id??entry.tools[0]?.id??''}:{group:'home',tool:''};});
  const editor = useEditor(workspace, route.group==='text-write'?'properties':'document', {autoRefresh:true});
  const navigation = useRef(0);
  const toolSwitch = useRef<AbortController|null>(null);
  const setRoute = useCallback((next: {group:string;tool:string}) => {
    navigation.current++;
    toolSwitch.current?.abort();
    // Navigation cancels stale reads, but keeps the last document summary visible.
    // Every write re-reads and validates its document before applying.
    workspace.cancelEditorRequests(false);
    workspace.updateSettings({workbenchView:next});
    updateRoute(next);
  }, [workspace]);
  useEffect(() => {
    const stop = () => { navigation.current++; toolSwitch.current?.abort(); workspace.cancelEditorRequests(); };
    // The sync watcher cancels only its own reads; blur must not cancel clicked commands.
    window.addEventListener('pagehide', stop);
    return () => { stop(); window.removeEventListener('pagehide', stop); };
  }, [workspace]);
  const [palette, setPalette] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionBusy = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const panelDrag=usePanelDrag(mainRef);
  const host = workspace.getHostInfo();
  const doc = workspace.getDocument();
  const groups = toolCatalog(workspace, discovered);
  const group = groups.find(g => g.id === route.group);
  const tool = group?.tools.find(t => t.id === route.tool) ?? group?.tools[0];
  const View = discovered.find(d => d.bundle.manifest.id === route.group)?.views[tool?.viewId ?? 'main'];
  const common = groups.filter(g => g.available).flatMap(g => g.tools.filter(t => t.homeOrder !== undefined).map(t => ({ group:g.id, tool:t }))).sort((a,b) => a.tool.homeOrder! - b.tool.homeOrder!);

  const followNativeTool=useCallback(async(groupId:string)=>{
    const visit=navigation.current;
    if(!workspace.getDocument()||!workspace.getHostInfo().capabilities.editorTools?.supported)return true;
    const controller=new AbortController();toolSwitch.current=controller;
    try {await workspace.selectNativeTool(groupId==='artboards'?'artboard':groupId==='text-write'?'text':'selection',controller.signal);return visit===navigation.current;}
    catch(e){if(visit===navigation.current)setError(e instanceof Error?e.message:'工具切换失败');return false;}
  },[workspace]);
  const openHome=useCallback(()=>{setRoute({group:'home',tool:''});setError(null);void followNativeTool('home');},[setRoute,followNativeTool]);

  useLayoutEffect(()=>{
    const key=route.group+':'+route.tool;
    const scroller=mainRef.current?.querySelector<HTMLElement>('.wb-export-scroll')??mainRef.current;
    if(!scroller)return;
    scroller.scrollTop=workspace.getSettings().toolScroll?.[key]??0;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const save=()=>{workspace.updateSettings({toolScroll:{...workspace.getSettings().toolScroll,[key]:scroller.scrollTop}});};
    const scroll=()=>{if(timer)clearTimeout(timer);timer=setTimeout(save,200);};
    scroller.addEventListener('scroll',scroll);window.addEventListener('pagehide',save);
    return()=>{if(timer)clearTimeout(timer);save();scroller.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',save);};
  },[workspace,route.group,route.tool]);

  const openTool = async (groupId: string, next: ToolContribution) => {
    if (actionBusy.current || !groups.find(g=>g.id===groupId)?.available) return;
    setRoute({ group:groupId, tool:next.id }); setError(null);
    const visit = navigation.current;

    // Explicit navigation only. Never switch tools from mount/focus/sync subscriptions.
    if(!await followNativeTool(groupId))return;
    if (visit !== navigation.current) return;
    if (!groups.find(g => g.id === groupId)?.available || !next.queryPreset) return;
    actionBusy.current = true; setBusy(true);
    try {
      // 当前范围完整保留，空选区不会扩大到全文档。
      const result = await workspace.resolveQuery({ ...next.queryPreset, scope:workspace.currentScope() });
      if (visit === navigation.current && next.selectResult && result.objects.length) {
        const outcome = await workspace.selectFromCurrentResult('objects');
        if (outcome.status !== 'completed') setError(outcome.error?.message ?? `选择完成 ${outcome.selectedObjectIds.length} 项，跳过 ${outcome.skipped.length} 项。`);
      }
    } catch(e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { actionBusy.current = false; setBusy(false); }
  };
  const toggleTool = async (id: string, enabled: boolean) => {
    if (actionBusy.current) return;
    actionBusy.current=true; setBusy(true); setError(null);
    try {
      if (enabled) await workspace.activateModule(id);
      else await workspace.deactivateModule(id);
    } catch(e) { setError(e instanceof Error?e.message:'工具状态修改失败'); }
    finally { actionBusy.current=false; setBusy(false); }
  };
  const refresh = useCallback(async () => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true); setError(null);
    try {
      await workspace.initialize();
      await workspace.activateAvailableModules();
      workspace.invalidateSnapshots();
      await workspace.readEditorState(route.group==='text-write'?'properties':'selection');
    } catch(e) { setError(e instanceof Error ? e.message : '连接失败'); }
    finally { actionBusy.current = false; setBusy(false); }
  }, [workspace,route.group]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const commands = useMemo(() => [
    { id:'home', title:'打开常用工具', icon:'modules' as const, run:openHome },
    { id:'settings', title:'打开设置与诊断', icon:'theme' as const, run:() => setRoute({group:'settings',tool:''}) },
    { id:'refresh', title:'重新连接并刷新文档', icon:'refresh' as const, run:refresh },
  ], [refresh, setRoute,openHome]);

  return <ThemeProvider initialSetting={workspace.getSettings().theme} resolveHostTheme={host.adapterKind === 'cep' ? resolveTheme : undefined} onSettingChange={theme => workspace.updateSettings({theme})}>
    <TooltipLayer/><div className={`aiq-workbench${panelDrag.dragging?' is-panel-dragging':''}`} data-ui-size={uiSize} style={{'--wb-sidebar-width':sidebarWidth} as CSSProperties} onPointerDownCapture={panelDrag.onPointerDownCapture}>
      <header className="wb-header">
        <span className="wb-brand" title="效率工作台"><Icon name="mirror" size={18} /><span>效率工作台</span></span>
        {host.adapterKind === 'demo' && <span className="wb-demo">演示模式</span>}
        <span className="wb-header-spacer" />
        {<><span className="wb-save-state" title="当前文档最近一次读取的保存状态；新建文档尚无保存位置">{editor.state?(editor.state.unsaved||!(editor.state.hasSaveLocation??!!editor.state.sourceFolder)?'未保存':'已保存'):'未读取'}</span><button className="wb-save-button" disabled={editor.busy||!editor.state} title="与 Ctrl+S 一致：保存到当前路径；从未保存过的文档会转为另存为" onClick={()=>void editor.act({type:'save'})}>保存</button><button className="wb-save-button" disabled={editor.busy||!editor.state?.nativeSaveAsSupported} title={editor.state?.nativeSaveAsSupported?'打开 Illustrator 原生另存为，选项与覆盖确认均由 Illustrator 处理':'原生另存为待本轮实机验证后启用'} onClick={()=>void editor.act({type:'save',saveAs:true,nativeDialog:true})}>另存为</button></>}
        <button className="wb-icon-button" title="搜索工具 · Ctrl+K" aria-label="搜索工具" onClick={() => setPalette(true)}><Icon name="search" /></button>
        <button className="wb-icon-button" title="重新连接并更新当前文档" aria-label="刷新文档" disabled={busy} onClick={() => void refresh()}><Icon name="refresh" /></button>
      </header>
      <div className="wb-artboard-status" aria-label="文档信息">{(()=>{const state=editor.state,ab=state?.artboards[state.activeArtboard],unit=state?.rulerUnit,bleed=workspace.getDocumentBleed();const bleedText=unit&&bleed?'出血（左/上/右/下）：'+bleed.map(n=>displayLength(n,unit)).join('/')+' '+unit:state?.bleedError??'出血：等待文档同步';return <>
        <span className="wb-board-index"><Icon name="size" size={13}/>{ab&&state?`第 ${ab.index+1} / ${state.artboards.length} 块画板`:'画板：等待文档同步'}</span>
        <strong title={unit?'文档标尺单位：'+unit:undefined}>{ab&&unit?`${displayLength(ab.bounds[2]-ab.bounds[0],unit)} × ${displayLength(ab.bounds[3]-ab.bounds[1],unit)} ${unit}`:'—'}</strong>
        <span className="wb-bleed-status" title={bleedText}>{bleedText}</span><div className="wb-board-actions"><button className="wb-artboard-edit" disabled={!ab||!groups.find(g=>g.id==='artboards')?.available} onClick={()=>{const boardGroup=groups.find(g=>g.id==='artboards');if(boardGroup?.tools[0])void openTool(boardGroup.id,boardGroup.tools[0]);}}>编辑画板</button><button className="wb-panel-grip" data-panel-grip aria-label="抓手滚动" title="按住上下拖动面板；也可拖动内容空白处" onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const s=mainRef.current?.querySelector<HTMLElement>('.wb-export-scroll')??mainRef.current;if(s)s.scrollTop+=e.key==='ArrowUp'?-80:80;}}}><Icon name="hand"/></button></div>
      </>;})()}</div>
      <div className="wb-layout" data-sidebar-side={sidebarSide}>
        <div className="wb-sidebar-dock" data-auto-hide={sidebarAutoHide} data-open={sidebarRevealed} onPointerEnter={e=>{if(!e.buttons)setSidebarRevealed(true);}} onPointerLeave={()=>setSidebarRevealed(false)} onFocusCapture={()=>setSidebarRevealed(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setSidebarRevealed(false);}}>
        <nav className="wb-sidebar" aria-label="工具栏">
          <button className="wb-nav" aria-current={route.group === 'home' ? 'page' : undefined} onClick={openHome}><Icon name="modules" size={18} /><span>常用</span></button>
          <span className="wb-divider" />
          {groups.map(g => <button key={g.id} className={`wb-nav ${g.available ? '' : 'is-unavailable'}`} disabled={!g.available} aria-label={NAV_LABELS[g.id] ?? g.title} aria-current={g.id === route.group ? 'page' : undefined} title={g.available ? g.title : `${g.title}：${g.reason}`} onClick={() => void openTool(g.id,g.tools[0]!)}><Icon name={g.icon} size={18}/><NavLabel text={NAV_LABELS[g.id] ?? g.title}/>{!g.available && <i aria-label={g.enabled?'暂不可用':'关闭'} />}</button>)}
          <span className="wb-sidebar-spacer" />
          <button className="wb-nav" aria-current={route.group === 'settings' ? 'page' : undefined} onClick={() => {setRoute({group:'settings',tool:''});setError(null);}}><Icon name="settings" size={18}/><span>设置</span></button>
        </nav>
        <SidebarResize width={sidebarWidth} onChange={setSidebarWidth} side={sidebarSide} locked={sidebarLocked}/></div>
        <main ref={mainRef} className={`wb-main ${route.group === 'export' ? 'wb-main-export' : ''}`} aria-label="工具面板">
          {host.connection !== 'connected' && <div className="wb-alert" role="alert"><Icon name="warn"/><span>Illustrator 未连接。{host.lastError?.message ?? '请重新连接。'}</span><Button onClick={() => void refresh()}>重试</Button></div>}
          {error && <div className="wb-alert" role="alert"><span>{error}</span><button className="wb-icon-button" aria-label="关闭错误提示" onClick={() => setError(null)}><Icon name="close"/></button></div>}
          {busy && <p className="wb-progress" role="status">正在处理…</p>}
          {route.group === 'home' && <>
            <div className="wb-heading"><h1>常用工具</h1></div>
            <NativeShortcuts workspace={workspace}/><div className="wb-section-label">快速操作<span title="快捷操作继承工具页设置的范围">{({document:'整个文档',selection:'当前选区',artboard:'指定画板',layer:'指定图层'})[workspace.currentScope().kind]}</span></div>
            {!doc && <p className="wb-inline-note">打开一个文档，然后点击右上角刷新，即可开始。</p>}
            <div className="wb-quick-grid">{common.map(c => <button key={`${c.group}:${c.tool.id}`} className="wb-tool-card" disabled={busy || !doc} title={c.tool.description} onClick={() => void openTool(c.group,c.tool)}><span className="wb-tool-icon"><Icon name={c.tool.icon} size={21}/></span><strong>{c.tool.title}</strong></button>)}</div>
            <div className="wb-home-footer"><Icon name="info" size={13}/><span>进入工具或回到面板时自动读取选区与文档状态。</span></div>
          </>}
          {route.group === 'settings' && <>
            <div className="wb-heading"><h1 title="界面与运行状态">设置</h1></div>
            <section className="aiq-card"><h3 className="aiq-card-title">界面主题</h3><ThemeControls/></section>
            <section className="aiq-card"><h3 className="aiq-card-title">主工具条</h3><div className="wb-segments" role="group" aria-label="工具条位置">{(['left','right'] as const).map(side=><button key={side} disabled={sidebarLocked} aria-pressed={sidebarSide===side} onClick={()=>workspace.updateSettings({sidebarSide:side})}>{side==='left'?'左侧':'右侧'}</button>)}</div><label className="wb-check"><input type="checkbox" aria-label="自动折叠主工具条" checked={sidebarAutoHide} onChange={e=>{setSidebarRevealed(false);workspace.updateSettings({sidebarAutoHide:e.target.checked});}}/>自动折叠，鼠标移至侧边展开</label><label className="wb-check"><input type="checkbox" aria-label="锁定主工具条" checked={sidebarLocked} onChange={e=>workspace.updateSettings({sidebarLocked:e.target.checked})}/>锁定位置和宽度</label></section>
            <section className="aiq-card"><h3 className="aiq-card-title">面板字号</h3><div className="wb-segments" role="group" aria-label="面板字号" title="同步调整工作台文字、图标、控件与间距，立即生效并记住设置。">{([['small','小'],['compact','较小'],['medium','中'],['mediumPlus','中大'],['comfortable','较大'],['large','大']] as const).map(([size,label])=><button key={size} aria-pressed={uiSize===size} onClick={()=>workspace.updateSettings({uiSize:size as AppSettings['uiSize']})}>{label}</button>)}</div></section>
            <section className="aiq-card"><h3 className="aiq-card-title">工具状态 <span className="wb-version">{workbenchVersion}</span></h3>{groups.map(g => <div key={g.id} className="wb-status-row" data-module={g.id}><strong>{g.title}</strong><span className={g.available ? 'wb-ready-text' : ''}>{!g.enabled?'关闭':g.available?'可用':'暂不可用'}</span><Button disabled={busy||(!g.enabled&&!g.canEnable)} aria-label={`${g.enabled?'关闭':'启用'}${g.title}`} onClick={()=>void toggleTool(g.id,!g.enabled)}>{g.enabled?'关闭':'启用'}</Button>{g.enabled&&!g.available && <p>{g.reason}</p>}</div>)}</section>
            <DataSettings workspace={workspace}/><UpdateSettings workspace={workspace}/><section className="aiq-card"><label className="wb-check"><input type="checkbox" defaultChecked={workspace.getSettings().liveEditorSync!==false} onChange={v=>workspace.updateSettings({liveEditorSync:v.target.checked})}/>返回面板时同步选区与属性</label></section><section className="aiq-card"><h3 className="aiq-card-title">连接与诊断</h3><p className="wb-inline-note">{host.displayName}</p><Button icon="refresh" onClick={() => void refresh()} disabled={busy}>重新连接</Button><p className="wb-inline-note">{host.limitations.filter(v=>!v.startsWith('0.4.0：')).join('；')}</p></section>
            {demoExtensions && <section className="aiq-card"><h3 className="aiq-card-title">演示数据</h3><Button onClick={() => demoExtensions.clearSelection()}>清空演示选区</Button></section>}
          </>}
          {group && tool && <>
            <div className="wb-heading wb-heading-small"><h1>{NAV_LABELS[group.id] ?? group.title}</h1></div>
            {!group.available ? <section className="wb-unavailable" role="status"><Icon name={group.icon} size={30}/><h2>{group.enabled?'暂时无法使用':'工具已关闭'}</h2><p>{group.reason}</p></section> : <>
              {group.tools.length > 1 && <div className="wb-tabs" aria-label="子工具">{group.tools.map(t => <button key={t.id} aria-pressed={tool.id === t.id} onClick={() => void openTool(group.id,t)} title={t.description}>{t.tabTitle ?? t.title}</button>)}</div>}
              {(group.id==='statistics'||group.id==='selection'&&!host.capabilities.editorTools?.supported) && <ScopeBar workspace={workspace}/>}
              {View && <PanelErrorBoundary key={`${group.id}:${tool.id}`} onRecover={()=>setRoute({group:'home',tool:''})}><View workspace={workspace} tool={tool}/></PanelErrorBoundary>}
              {(group.id==='preflight'||group.id==='selection'&&!host.capabilities.editorTools?.supported) && <ResultsPanel key={workspace.currentResult()?.requestId} workspace={workspace} onActionError={setError} demoExtensions={demoExtensions}/>}
            </>}
          </>}
        </main>
      </div>
      {host.capabilities.editorTools?.supported&&<div className="wb-fixed-shortcuts" role="toolbar" aria-label="快捷工具"><div className="wb-shortcut-group">{([['group','▧ 群组'],['ungroup','▦ 解组'],['mask-create','▣ 创建剪贴蒙版'],['mask-release','▢ 解散剪贴蒙版']] as const).map(([command,label])=><Button key={command} disabled={editor.busy||!editor.state?.nativeCommands?.includes(command)} onClick={()=>void editor.act({type:'native',command})}>{label}</Button>)}</div><div className="wb-shortcut-group"><Button disabled={editor.busy||!editor.state?.nativeCommands?.includes('smart-group')} title="按可见填色区域交集分组；文字和图片按外框，保留蒙版" onClick={()=>void editor.act({type:'smart-group'})}>智能群组</Button><Button disabled={editor.busy||!editor.state?.nativeCommands?.includes('ungroup-all')} title="递归解开所选普通群组，保留剪切蒙版和群组外观" onClick={()=>void editor.act({type:'ungroup-all'})}>全部取消群组</Button></div></div>}
      <StatusBar/>
      <EditorFeedback message={editor.message} error=""/>
      {workspace.getSettingsStorageStatus().warning&&<p className="wb-save-error" role="alert">{workspace.getSettingsStorageStatus().warning}</p>}
      {editor.error && <p className="wb-save-error" role="alert">{editor.error}</p>}
      <CommandPalette workspace={workspace} extraCommands={commands} onActionError={setError} open={palette} onClose={() => setPalette(false)}/>
    </div>
  </ThemeProvider>;
}
function NavLabel({text}:{text:string}) {
  return <span className="wb-nav-label">{(text.match(/.{1,2}/gu)??[text]).map((line,index)=><span key={index}>{line}</span>)}</span>;
}
function ThemeControls() {
  const theme = useTheme();
  return <div className="wb-segments" role="group" aria-label="主题">{(['follow','light','dark'] as const).map(value => <button key={value} aria-pressed={theme.setting === value} onClick={() => theme.setSetting(value)}>{({follow:'跟随宿主',light:'浅色',dark:'深色'})[value]}</button>)}</div>;
}
