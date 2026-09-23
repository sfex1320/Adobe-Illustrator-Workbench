// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {Field,TooltipLayer} from '@aiq/ui';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('positions browser DOMRect coordinates whose properties are inherited',()=>{
 vi.useFakeTimers();render(<><TooltipLayer/><button title="定位提示">目标</button></>);
 const button=screen.getByRole('button');vi.spyOn(button,'getBoundingClientRect').mockReturnValue(new DOMRect(130,120,50,20));
 fireEvent.mouseOver(button);act(()=>vi.advanceTimersByTime(350));
 const tooltip=screen.getByRole('tooltip');expect(tooltip.style.left).toBe('130px');expect(tooltip.style.top).toBe('144px');
});
it('shows themed hover help, suppresses native duplicate, keeps nested hover and restores the title',()=>{
 vi.useFakeTimers();render(<><TooltipLayer/><button title="保持倍率与 PPI"><span>导出</span></button></>);
 const button=screen.getByRole('button');fireEvent.mouseOver(button);expect(button).not.toHaveAttribute('title');
 act(()=>vi.advanceTimersByTime(350));expect(screen.getByRole('tooltip')).toHaveTextContent('保持倍率与 PPI');
 fireEvent.mouseOver(screen.getByText('导出'));expect(screen.getByRole('tooltip')).toBeVisible();
 fireEvent.mouseOut(button,{relatedTarget:document.body});expect(screen.queryByRole('tooltip')).toBeNull();expect(button).toHaveAttribute('title','保持倍率与 PPI');
});
it('keyboard focus inherits field help, Escape dismisses, and cleanup restores prior accessibility metadata',()=>{
 vi.useFakeTimers();const view=render(<><TooltipLayer/><Field label="PPI" help="成品分辨率"><input aria-label="PPI"/></Field></>);
 const input=screen.getByRole('textbox');fireEvent.focusIn(input);act(()=>vi.runOnlyPendingTimers());expect(screen.getByRole('tooltip')).toHaveTextContent('成品分辨率');
 fireEvent.keyDown(input,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();
 fireEvent.focusIn(input);act(()=>vi.runOnlyPendingTimers());view.unmount();expect(document.querySelector('[role=tooltip]')).toBeNull();
});
