// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {installCepInputKeys} from '../packages/host-adapter/src/input-keys';
afterEach(()=>{document.body.innerHTML='';});
it('reserves typing keys only while an editable field is focused and releases on blur',()=>{
 const register=vi.fn(),stop=installCepInputKeys({registerKeyEventsInterest:register},'Win32');
 document.body.innerHTML='<input id="text"><input id="check" type="checkbox"><textarea></textarea>';
 const input=document.querySelector('input')!;input.focus();
 const keys=JSON.parse(register.mock.calls.at(-1)![0]);
 expect(keys).toContainEqual({keyCode:49});expect(keys).toContainEqual({keyCode:97});
 // Windows IMEs can report a processed key instead of the original digit VK.
 expect(keys).toContainEqual({keyCode:229});
 window.dispatchEvent(new Event('blur'));expect(register).toHaveBeenLastCalledWith('');
 window.dispatchEvent(new Event('focus'));expect(register.mock.calls.at(-1)![0]).not.toBe('');
 document.querySelector<HTMLInputElement>('#check')!.focus();expect(register).toHaveBeenLastCalledWith('');
 document.querySelector('textarea')!.focus();expect(register.mock.calls.at(-1)![0]).not.toBe('');
 stop();expect(register).toHaveBeenLastCalledWith('');
});
it('does not use Windows virtual key codes on another platform or fail browser startup',()=>{
 const register=vi.fn();installCepInputKeys({registerKeyEventsInterest:register},'MacIntel')();
 expect(register).not.toHaveBeenCalled();expect(()=>installCepInputKeys(undefined,'Win32')()).not.toThrow();
});
