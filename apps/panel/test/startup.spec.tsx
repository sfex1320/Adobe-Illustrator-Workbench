// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {Workspace} from '@aiq/core';
import {CepBridge,CepHostAdapter} from '@aiq/host-adapter';
import {DEFAULT_APP_SETTINGS} from '@aiq/contracts';
import {PanelApp} from '../src/App';
import {discoverModules} from '../src/module-discovery';
import {PanelErrorBoundary} from '../src/PanelErrorBoundary';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('restores the size page with bleed enabled before reading editor state',async()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
 const calls:string[]=[];
 const bridge=new CepBridge((script,callback)=>{
  const req=JSON.parse(decodeURIComponent(script.slice(12,-2)));calls.push(req.command);
  const data=req.command==='PING'?{appName:'Test',appVersion:'30.0.0'}:{sessionId:'test',name:'Test.ai',unsavedChanges:true};
  callback(JSON.stringify({id:req.id,ok:true,data}));
 });
 const workspace=new Workspace({adapter:new CepHostAdapter(bridge),settingsStore:{load:()=>({...DEFAULT_APP_SETTINGS,workbenchView:{group:'size-align',tool:'adjust'},sizePreferences:{width:'334.900',height:'100',unit:'auto',valueUnit:'mm',proportion:null,together:'each',includeBleed:true}}),save:()=>{}}});
 const discovered=await discoverModules();for(const m of discovered)workspace.registerModule(m.bundle);
 await workspace.initialize();await workspace.activateAvailableModules();
 render(<PanelErrorBoundary><PanelApp workspace={workspace} discovered={discovered} demoExtensions={null}/></PanelErrorBoundary>);
 await waitFor(()=>expect(screen.getByLabelText('目标宽度')).toHaveValue('334.9'));
 expect(screen.queryByRole('button',{name:'读取文档出血'})).not.toBeInTheDocument();expect(screen.getByLabelText('文档信息')).toBeInTheDocument();
 expect(screen.queryByText(/取样后保留宽高/)).not.toBeInTheDocument();
 expect(calls).toEqual(['PING','GET_DOCUMENT_CONTEXT']);
});

it('keeps a readable recovery message when a child render fails',()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 function Broken():never{throw Error('test render failure');}
 render(<PanelErrorBoundary><Broken/></PanelErrorBoundary>);
 expect(screen.getByRole('alert')).toHaveTextContent('工作台界面加载失败');
});
