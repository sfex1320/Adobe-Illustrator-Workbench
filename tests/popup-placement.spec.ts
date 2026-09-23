import {expect,it} from 'vitest';
import {popupPlacement} from '../packages/ui/src/popup.js';

it('opens above a bottom toolbar and clamps horizontal placement',()=>{
 const p=popupPlacement({left:250,top:650,bottom:680,width:100},180,280,{width:320,height:720});
 expect(p.side).toBe('up');expect(p.style.top+280).toBeLessThanOrEqual(650);
 expect(p.style.left+p.style.width).toBeLessThanOrEqual(312);
});
it('uses below when it fits and scrolls when neither side has room',()=>{
 const a={left:20,top:70,bottom:100,width:100};
 expect(popupPlacement(a,180,280,{width:320,height:720}).side).toBe('down');
 const p=popupPlacement({...a,top:200,bottom:230},180,500,{width:260,height:400});
 expect(p.side).toBe('up');expect(p.style.maxHeight).toBe(188);
 expect(p.style.top).toBe(8);
});
