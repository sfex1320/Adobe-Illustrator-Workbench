import { useCallback, useEffect, useRef, useState } from 'react';
import { watchEditorSync } from './editor-sync.js';
import { publishFeedback } from './feedback.js';
import type { AppSettings, EditorAction, EditorState, EditorResult } from '@aiq/contracts';
export interface EditorPort {
  getEditorRevision?():Promise<string|null>;
  getSettings?():{liveEditorSync?:boolean;toolPreferences?:Record<string,unknown>};
  updateSettings?(patch:Partial<AppSettings>):void;
  readEditorState(profile?: 'document' | 'selection' | 'properties', signal?:AbortSignal): Promise<EditorState|null>;
  getEditorState?(): EditorState|null;
  onEditorState?(listener:(state:EditorState|null)=>void):()=>void;
  editDocument(state:EditorState,action:EditorAction,signal?:AbortSignal):Promise<EditorResult>;
}
/** All reads are explicit. Subscribers share state without starting host work. */
export function useEditor(port:EditorPort, profile: 'document' | 'selection' | 'properties' = 'selection', options?:{autoRefresh?:boolean}) {
  const [state,setState]=useState<EditorState|null>(()=>port.getEditorState?.()??null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const current=useRef(state),running=useRef(false),alive=useRef(true),controller=useRef(new AbortController());
  useEffect(()=>{
    alive.current=true; controller.current=new AbortController();
    const off=port.onEditorState?.(s=>{if(!s)controller.current.abort();current.current=s;setState(s);});
    // 仅卸载时中止进行中的动作。CEP 停靠面板在标签切换/主窗口失焦时会触发 blur 与
    // visibilitychange；用户已点击的动作必须继续完成，静默中止会让全部功能“点了没反应”。
    return()=>{alive.current=false;controller.current.abort();off?.();};
  },[port]);
  const read=useCallback(async()=>{
    try { const s=await port.readEditorState(profile);if(alive.current){current.current=s;setState(s);setError('');}return s; }
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'读取失败');return null;}
  },[port,profile]);
  // 所有订阅者共享返回面板单次读取；画布操作期间禁止周期宿主调用。
  useEffect(()=>{
    if(!options?.autoRefresh)return;
    return watchEditorSync(port,profile);
  },[options?.autoRefresh,port,profile]);
  const act=async(input:EditorAction|((state:EditorState,signal:AbortSignal)=>EditorAction|Promise<EditorAction>))=>{
    // 防重入只看 running。document.hidden 不能作为拒绝条件：能点到按钮说明面板可见，
    // CEP 停靠面板的 hidden 状态在标签切换后会滞留为 true，静默吞掉用户点击。
    if(running.current)return;
    running.current=true;setBusy(true);setError('');setMessage('');
    controller.current=new AbortController();const signal=controller.current.signal;
    try {
      const intendedDocument=current.current?.docSessionId,intendedSelection=current.current?.selectionKey;
      const freshProfile=typeof input!=='function'&&['save','choose-folder','fonts'].includes(input.type)?'document':typeof input!=='function'&&(input.type==='native'||input.type==='smart-group'||input.type==='ungroup-all'||input.type==='artboard'&&input.operation==='from-selection')?'selection':profile;
      const s=freshProfile?await port.readEditorState(freshProfile):current.current;
      // signal 仅在组件卸载或工具切换清空状态（onEditorState(null)）时中止；
      // blur / hidden 不再触发中止：CEP 停靠面板失焦是常态，静默吞掉点击会让全部功能失效。
      if(!alive.current||signal.aborted)return;
      if(!s)throw Error('Illustrator 中没有可读取的文档');
      if(intendedDocument&&s.docSessionId!==intendedDocument)throw Error('文档已切换，请核对当前文档后重新操作');
      const action=typeof input==='function'?await input(s,signal):input;
      if(!alive.current||signal.aborted)return;
      if((action.type==='native-align'&&action.referenceId||action.type==='geometry')&&typeof input!=='function'&&intendedSelection&&s.selectionKey!==intendedSelection)throw Error('选区已改变，请重新指定目标');
      const r=await port.editDocument(s,action,signal);
      if(!alive.current)return;
      if(r.status!=='completed'&&r.status!=='partial')throw Error(r.error?.message??r.skipped[0]?.reason??r.message??'操作未完成');
      if(!signal.aborted){setMessage(r.message??'已完成');if(r.sideEffects.length||action.type==='capture-targets'||freshProfile!==profile)await read();}
      return r;
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'操作失败');}
    finally{running.current=false;if(alive.current)setBusy(false);}
  };
  return {state,busy,message,error,read,act};
}
/** 0.6.29 成功提示进入底部常驻状态条；错误保留原地警示，避免异常被淹没。 */
export function EditorFeedback({message,error}:{message:string;error:string}) {
  useEffect(() => { if (message) publishFeedback(message, ''); }, [message]);
  useEffect(() => { if (error) publishFeedback('', error); }, [error]);
  return <>{error&&<p className="aiq-error-text" role="alert">{error}</p>}</>;
}
export function Segments<T extends string>({value,onChange,options,label}:{value:T;onChange:(v:T)=>void;options:Array<[T,string]>;label:string}) {return <div className="wb-segments" role="group" aria-label={label}>{options.map(([v,text])=><button key={v} aria-pressed={value===v} onClick={()=>onChange(v)}>{text}</button>)}</div>;}
