// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/react';
import {arrangeBoardGrid} from '@aiq/core';
import type {Bounds} from '@aiq/contracts';
import {Arrangement} from '../packages/ui/src/Arrangement';
it('70 boards form 20+20+20+10 blocks with independent row and column limits',()=>{
 const items=Array.from({length:70},(_,i)=>({id:String(i),bounds:[i*20,0,i*20+10,10] as Bounds}));
 const p=arrangeBoardGrid(items,4,5,2,3,'0');
 expect(p[0]?.bounds).toEqual(items[0]?.bounds);
 for(let start=0;start<70;start+=20){const block=p.slice(start,start+20);expect(new Set(block.map(o=>o.bounds[0])).size).toBe(4);expect(new Set(block.map(o=>o.bounds[1])).size).toBe(start===60?3:5);}
 expect(p[20]!.bounds[0]-p[19]!.bounds[2]).toBeGreaterThan(56);
 for(const o of p){expect(o.bounds[2]-o.bounds[0]).toBeCloseTo(10,8);expect(o.bounds[3]-o.bounds[1]).toBeCloseTo(10,8);}
 const anchored=arrangeBoardGrid(items,4,5,2,3,'37');anchored.find(o=>o.id==='37')!.bounds.forEach((v,i)=>expect(v).toBeCloseTo(items[37]!.bounds[i]!,8));
});
it('typing columns, rows and a cleared draft does not rewrite its partner',()=>{
 const apply=vi.fn();render(<Arrangement artboards busy={false} unit="mm" anchorOptions={Array.from({length:70},(_,i)=>[String(i),'画板'])} onApply={apply}/>);
 fireEvent.change(screen.getByLabelText('列数'),{target:{value:''}});
 fireEvent.change(screen.getByLabelText('列数'),{target:{value:'4'}});
 fireEvent.change(screen.getByLabelText('行数'),{target:{value:'5'}});
 expect(screen.getByLabelText('列数')).toHaveValue('4');expect(screen.getByLabelText('行数')).toHaveValue('5');
 fireEvent.click(screen.getByText('排列'));expect(apply).toHaveBeenCalledWith(4,5,0,0,'0',true);cleanup();
});
