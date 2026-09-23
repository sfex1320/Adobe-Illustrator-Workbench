import {useRef,useState} from 'react';
import type {Dispatch,SetStateAction} from 'react';
import type {AppSettings} from '@aiq/contracts';
export interface PreferencePort {
  getSettings?(): Pick<AppSettings,'toolPreferences'>;
  updateSettings?(patch:Partial<AppSettings>):void;
}
/** Persist explicit user changes, never mount defaults or document-derived state. */
export function usePreference<T>(port:PreferencePort,key:string,fallback:T,allowed?:readonly T[]):[T,Dispatch<SetStateAction<T>>] {
  const [value,setValue]=useState<T>(()=>{
    const v=port.getSettings?.().toolPreferences?.[key];
    if(v===undefined||v===null||typeof v!==typeof fallback||Array.isArray(v)!==Array.isArray(fallback))return fallback;
    if(allowed&&!allowed.includes(v as T))return fallback;
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      const merged={...fallback,...v} as Record<string,unknown>;
      // Old optional objects are not a schema: preserve valid options, but do not
      // let a null/incorrect leaf replace a required default and break rendering.
      for(const [field,defaultValue] of Object.entries(fallback as Record<string,unknown>)){
        const saved=merged[field];
        if(saved===null||typeof saved!==typeof defaultValue||Array.isArray(saved)!==Array.isArray(defaultValue))merged[field]=defaultValue;
      }
      return merged as T;
    }
    return v as T;
  });
  const current=useRef(value);current.current=value;
  const update:Dispatch<SetStateAction<T>>=next=>{
    const v=typeof next==='function'?(next as (previous:T)=>T)(current.current):next;
    port.updateSettings?.({toolPreferences:{...port.getSettings?.().toolPreferences,[key]:v}});
    current.current=v;setValue(v);
  };
  return [value,update];
}
