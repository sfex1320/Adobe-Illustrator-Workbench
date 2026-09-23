import {expect,it} from 'vitest';
import {Workspace} from '@aiq/core';
import {CepBridge,CepHostAdapter} from '@aiq/host-adapter';
import {DEFAULT_APP_SETTINGS,type EditorState} from '@aiq/contracts';

it('merged state reads publish bleed once and clear invalid or absent document values',async()=>{
 let doc='one';let offsets:number[]|null=[2,3,5,7];let empty=false;const commands:string[]=[];
 const bridge=new CepBridge((script,callback)=>{
  const request=JSON.parse(decodeURIComponent(script.slice(12,-2)));commands.push(request.command);
  const data=request.command==='PING'?{appName:'Offline test',appVersion:'30.0.0'}:
   request.command==='GET_DOCUMENT_CONTEXT'?{sessionId:doc,name:'Fixture.ai',unsavedChanges:true}:
   request.command==='GET_EDITOR_STATE'?(empty?null:{token:doc,docSessionId:doc,docName:'Fixture.ai',objects:[],artboards:[],bleedOffsets:offsets}):null;
  callback(JSON.stringify({id:request.id,ok:true,data}));
 });
 const workspace=new Workspace({adapter:new CepHostAdapter(bridge),settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
 await workspace.initialize();await workspace.readEditorState();expect(workspace.getDocumentBleed()).toEqual([2,3,5,7]);
 offsets=null;await workspace.readEditorState();expect(workspace.getDocumentBleed()).toBeNull();
 doc='two';offsets=[0,0,0,0];await workspace.readEditorState();expect(workspace.getDocumentBleed()).toEqual([0,0,0,0]);
 offsets=[0,NaN,0,0];await workspace.readEditorState();expect(workspace.getDocumentBleed()).toBeNull();
 offsets=[1,1,1,1];await workspace.readEditorState();empty=true;await workspace.readEditorState();expect(workspace.getDocumentBleed()).toBeNull();
 expect(commands).not.toContain('EDIT_DOCUMENT');
});

it('explicit bleed cache is session-scoped and an unsuccessful reread removes stale values',async()=>{
 let doc='one',fail=false;let offsets=[2,3,5,7];
 const bridge=new CepBridge((script,callback)=>{
  const request=JSON.parse(decodeURIComponent(script.slice(12,-2)));
  let data:unknown=null;
  if(request.command==='PING')data={appName:'Offline test',appVersion:'30.0.0'};
  else if(request.command==='GET_DOCUMENT_CONTEXT')data={sessionId:doc,name:'Fixture.ai',unsavedChanges:true};
  else if(request.command==='GET_EDITOR_STATE')data={token:doc,docSessionId:doc,docName:'Fixture.ai',objects:[],artboards:[]} as unknown as EditorState;
  else if(request.command==='EDIT_DOCUMENT'){
   if(fail){callback(JSON.stringify({id:request.id,ok:false,error:{code:'HOST_SCRIPT_ERROR',message:'read failed'}}));return;}
   data={status:'completed',selectedObjectIds:[],skipped:[],sideEffects:[],bleedOffsets:offsets};
  }
  callback(JSON.stringify({id:request.id,ok:true,data}));
 });
 const workspace=new Workspace({adapter:new CepHostAdapter(bridge),settingsStore:{load:()=>DEFAULT_APP_SETTINGS,save:()=>{}}});
 // A restored size panel renders before any editor-state request is permitted.
 expect(workspace.getDocumentBleed()).toBeNull();
 await workspace.initialize();expect(workspace.getDocumentBleed()).toBeNull();const state=(await workspace.readEditorState())!;
 expect(workspace.getDocumentBleed()).toBeNull();await workspace.editDocument(state,{type:'read-bleed'});
 expect(workspace.getDocumentBleed()).toEqual([2,3,5,7]);
 doc='two';await workspace.readEditorState();expect(workspace.getDocumentBleed()).toBeNull();
 doc='one';await workspace.readEditorState();fail=true;
 await expect(workspace.editDocument(state,{type:'read-bleed'})).rejects.toThrow('read failed');
 expect(workspace.getDocumentBleed()).toBeNull();
 fail=false;offsets=[0,0,0,0];await workspace.editDocument(state,{type:'read-bleed'});expect(workspace.getDocumentBleed()).toEqual([0,0,0,0]);
 offsets=[-1,0,0,0];await workspace.editDocument(state,{type:'read-bleed'});expect(workspace.getDocumentBleed()).toBeNull();
});
