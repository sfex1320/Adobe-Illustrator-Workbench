import {describe,it,expect} from 'vitest';
import {numberSequence} from '../packages/core/src/number-sequence.js';
import {barcodePlan} from '../packages/modules/productivity/src/barcode.js';
import {lengthOptions} from '../packages/modules/productivity/src/length-options.js';
describe('production numbering',()=>{
 it('preserves prefix, zeros and descending steps',()=>{expect(numberSequence({start:5,step:-2,count:4,digits:3,prefix:'门牌-',suffix:'号'})).toEqual(['门牌-005号','门牌-003号','门牌-001号','门牌--001号']);});
 it('rejects invalid count, duplicate numbers and unsafe overflow',()=>{const p={start:1,step:1,count:3,digits:3,prefix:'',suffix:''};for(const patch of [{count:0},{count:301},{step:0},{digits:0},{start:Number.MAX_SAFE_INTEGER}])expect(()=>numberSequence({...p,...patch})).toThrow();});
 it('adds and validates EAN check digit',()=>{expect(barcodePlan('590123412345','ean13').text).toBe('5901234123457');expect(()=>barcodePlan('5901234123458','ean13')).toThrow('校验位');});
 it('has 95 EAN modules and finite ordered black bars',()=>{const p=barcodePlan('5901234123457','ean13');expect(p.width).toBe(95);expect(p.bars[0]).toEqual([0,1]);expect(p.bars.at(-1)).toEqual([94,1]);expect(p.bars.every(([x,w],i)=>w>0&&(!i||x>p.bars[i-1]![0]))).toBe(true);});
 it('refuses unsupported content instead of encoding misleading labels',()=>{expect(()=>barcodePlan('设备001','code128')).toThrow();expect(()=>barcodePlan('','code128')).toThrow();expect(()=>barcodePlan('123','ean13')).toThrow();});
});
it('converts saved physical lengths across documents while preserving unfinished drafts',()=>{
 const saved={valueUnit:'mm',x:'25.4',y:'',maxHeight:'254',tolerance:'2.54',dx:'-',dy:'-25.4',moduleWidth:'0.33'};
 expect(lengthOptions(saved,'in')).toEqual({...saved,x:'1',maxHeight:'10',tolerance:'0.1',dy:'-1'});
 expect(lengthOptions(saved,'mm')).toEqual(saved);
 expect(lengthOptions(saved,undefined)).toEqual(saved);
 expect(lengthOptions({...saved,valueUnit:''},'pt').x).toBe('25.4');
 expect(saved.x).toBe('25.4');
});
