import {Field} from './components.js';

export function AnnotationColor({value,onChange,label='标注颜色（线条与文字）'}:{label?:string;value:string;onChange:(value:string)=>void}) {
 return <Field label={label}><div className="wb-annotation-color"><input type="color" aria-label="选择标注颜色" value={/^#[\da-f]{6}$/i.test(value)?value:'#2364c8'} onChange={e=>onChange(e.target.value)}/><input className="aiq-input" aria-label="标注颜色" value={value} placeholder="#2364c8" onChange={e=>onChange(e.target.value)}/></div></Field>;
}
