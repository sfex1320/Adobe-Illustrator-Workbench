import {readTable} from './table.js';
import type {VariableHeaderDirection} from '@aiq/contracts';
self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;name:string;sheet?:string;hidden:boolean;encoding:string;direction?:VariableHeaderDirection}>)=>{
 try{const {bytes,name,sheet,hidden,encoding,direction}=event.data;self.postMessage({table:await readTable(bytes,name,sheet,hidden,encoding,direction)});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
