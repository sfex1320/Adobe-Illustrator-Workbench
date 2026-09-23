import {UNIT_FACTORS,unitFactor} from '@aiq/core';
import type {RulerUnit} from '@aiq/contracts';

const lengthKeys=['x','y','maxHeight','tolerance','dx','dy'] as const;
export type LengthOptions=Record<typeof lengthKeys[number],string>&{valueUnit:string};
/** Convert displayed drafts without overwriting saved physical values on mount. */
export function lengthOptions<T extends LengthOptions>(saved:T,unit:RulerUnit|undefined):T{
 if(!unit||!(unit in UNIT_FACTORS)||!(saved.valueUnit in UNIT_FACTORS))return {...saved};
 const from=unitFactor(saved.valueUnit as RulerUnit),to=unit?unitFactor(unit):NaN;
 if(!Number.isFinite(from)||!Number.isFinite(to)||from===to)return {...saved};
 const next={...saved};
 for(const key of lengthKeys){const raw=saved[key];if(raw.trim()&&Number.isFinite(Number(raw)))next[key]=String(Number((Number(raw)*from/to).toFixed(2)));}
 return next;
}
