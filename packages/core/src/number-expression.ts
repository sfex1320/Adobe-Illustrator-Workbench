/** Bounded arithmetic parser for numeric drafts. Never evaluates JavaScript. */
export function parseNumberExpression(draft:string):number {
 const text=draft.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
 const fail=():never=>{throw Error('请输入有效数字或四则运算式（支持 + − × ÷ 和括号）');};
 if(!text.trim()||text.length>256)return fail();
 let index=0,depth=0;
 const space=()=>{while(/\s/.test(text[index]??'')&&index<text.length)index++;};
 const primary=():number=>{
  space();if(++depth>32)return fail();let n:number;
  const c=text[index];
  if(c==='+'||c==='-'){index++;n=(c==='-'?-1:1)*primary();}
  else if(c==='('){index++;n=sum();space();if(text[index++]!==')')return fail();}
  else {const match=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(index));if(!match)return fail();index+=match[0].length;n=Number(match[0]);}
  depth--;return n;
 };
 const product=():number=>{let n=primary();for(;;){space();const op=text[index];if(op!=='*'&&op!=='/')return n;index++;const rhs=primary();n=op==='*'?n*rhs:n/rhs;}};
 const sum=():number=>{let n=product();for(;;){space();const op=text[index];if(op!=='+'&&op!=='-')return n;index++;const rhs=product();n=op==='+'?n+rhs:n-rhs;}};
 const value=sum();space();if(index!==text.length||!Number.isFinite(value))return fail();return value;
}
