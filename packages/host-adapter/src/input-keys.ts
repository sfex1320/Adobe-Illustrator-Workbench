interface CepKeyPort {registerKeyEventsInterest?(keys:string):unknown}
/** Reserve Windows typing keys only during text entry; never invoke the document host. */
export function installCepInputKeys(
 port:CepKeyPort|undefined=(globalThis as {__adobe_cep__?:CepKeyPort}).__adobe_cep__,
 platform=navigator.platform,
):()=>void {
 if(!port?.registerKeyEventsInterest||!/^Win/i.test(platform))return()=>{};
 // VK_PROCESSKEY (229) is emitted by Windows IMEs; reserving only the original
 // digit VKs leaves this path available to Illustrator's shortcut handling.
 const codes=[8,9,13,27,32,35,36,37,38,39,40,46,229,...Array.from({length:43},(_,i)=>48+i),...Array.from({length:16},(_,i)=>96+i),...Array.from({length:37},(_,i)=>186+i)];
 const keys=JSON.stringify([...codes.flatMap(keyCode=>[{keyCode},{keyCode,shiftKey:true}]),...[65,67,86,88,89,90,35,36,37,39,8,46].flatMap(keyCode=>[{keyCode,ctrlKey:true},{keyCode,ctrlKey:true,shiftKey:true}])]);
 let registered=false;
 const set=(active:boolean)=>{if(active===registered)return;try{port.registerKeyEventsInterest!(active?keys:'');registered=active;}catch{/* Unsupported CEP must not blank the workbench. */}};
 const editable=(target:EventTarget|null)=>target instanceof HTMLTextAreaElement?!target.disabled&&!target.readOnly:target instanceof HTMLInputElement&&!target.disabled&&!target.readOnly&&['text','number','search','email','url','tel','password'].includes(target.type);
 const focus=()=>set(!document.hidden&&editable(document.activeElement));
 const out=(event:FocusEvent)=>set(editable(event.relatedTarget));
 const clear=()=>set(false);
 const visibility=()=>{if(document.hidden)clear();};
 document.addEventListener('focusin',focus);document.addEventListener('focusout',out);
 document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',clear);window.addEventListener('focus',focus);window.addEventListener('pagehide',clear);
 focus();return()=>{clear();document.removeEventListener('focusin',focus);document.removeEventListener('focusout',out);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',clear);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',clear);};
}
