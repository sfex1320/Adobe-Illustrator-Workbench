import { Field, PresetInput } from '@aiq/ui';

/** UI uses multipliers; persisted settings and the host contract remain percentages. */
export function ScaleField({value,onChange,label='导出缩放',help}:{value:string;onChange:(value:string)=>void;label?:string;help?:string}) {
 return <Field label="成品倍率" help={help}><div className="wb-scale-field"><PresetInput label={label} inputMode="decimal" value={value} onChange={onChange} presets={[0.01,0.1,1,10,100]}/><span>倍</span></div></Field>;
}
export function scalePercent(draft:string):number {
 const multiplier=Number(draft);
 if(!draft.trim()||!Number.isFinite(multiplier)||multiplier<0.01||multiplier>100)throw Error('成品倍率须为 0.01–100 倍');
 return multiplier*100;
}
