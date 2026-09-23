// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/react';
import {Arrangement} from '../packages/ui/src/Arrangement';
import {boardTargets} from '../packages/ui/src/BoardTargets';
import {artboardOwners} from '../packages/core/src/smart-group';
import {arrangeBoardGrid} from '@aiq/core';
afterEach(cleanup);
it('repairs short legacy preferences and preserves decimal drafts for both gaps',()=>{
 const port={getSettings:()=>({toolPreferences:{'arrangeBoards.values':['5','3']}}),updateSettings:vi.fn()},apply=vi.fn();
 render(<Arrangement workspace={port} artboards busy={false} unit="mm" anchorOptions={[["2","第三画板"]]} onApply={apply}/>);
 fireEvent.change(screen.getByLabelText('列间距 mm'),{target:{value:'12.'}});expect(screen.getByLabelText('列间距 mm')).toHaveValue('12.');
 fireEvent.change(screen.getByLabelText('列间距 mm'),{target:{value:'12.5'}});fireEvent.change(screen.getByLabelText('行间距 mm'),{target:{value:'7.25'}});
 fireEvent.click(screen.getByText('排列'));expect(apply).toHaveBeenCalledWith(5,3,12.5,7.25,'2',true);
});
it('current honors native multiselection, manual selection stays independent',()=>{
 const boards=[0,1,2,3].map(index=>({index,name:String(index),bounds:[0,0,10,10] as [number,number,number,number]}));
 expect(boardTargets(boards,0,'active',[],[0,2,3])).toEqual([0,2,3]);expect(boardTargets(boards,0,'custom',[1,3],[0,2])).toEqual([1,3]);expect(boardTargets(boards,0,'active',[],[])).toEqual([0]);
});
it('block capacity uses user row count times columns, never a fixed twenty',()=>{
 const items=Array.from({length:17},(_,i)=>({id:String(i),bounds:[i*20,0,i*20+10,10] as [number,number,number,number]}));const out=arrangeBoardGrid(items,3,2,1,2,'0');
 expect(out[6]!.bounds[0]).toBeGreaterThan(out[5]!.bounds[2]+50);expect(out[6]!.bounds[1]).toBe(out[0]!.bounds[1]);expect(out[12]!.bounds[1]).toBe(out[0]!.bounds[1]);
});
it('curved-mask polygon excludes the bounding-box corner and nested masks respect holes',()=>{
 const boards=[{index:0,bounds:[0,0,10,10]},{index:1,bounds:[10,0,20,10]}];
 const root={rings:[[[0,0],[20,0],[20,-10],[0,-10]] as [number,number][]],clip:{rings:[[[0,0],[20,0],[0,-10]] as [number,number][]]}};
 expect(artboardOwners([root],boards)).toEqual([0]);
 const outside={rings:[[[18,-8],[20,-8],[20,-10],[18,-10]] as [number,number][]],clip:root.clip};expect(artboardOwners([outside],boards)).toEqual([-1]);
});
