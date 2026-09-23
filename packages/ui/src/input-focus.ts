import { useEffect } from 'react';

/** First activation selects the draft; later clicks retain normal caret/drag behavior. */
export function useSelectAllOnFocus() {
  useEffect(() => {
    let firstPointer: HTMLInputElement | HTMLTextAreaElement | null = null;
    const editable = (target: EventTarget | null) => {
      if (target instanceof HTMLTextAreaElement) return target.disabled || target.readOnly ? null : target;
      if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return null;
      return ['text', 'search', 'number', 'email', 'url', 'tel', 'password'].includes(target.type) ? target : null;
    };
    const down = (event: PointerEvent) => {
      const field = editable(event.target);
      firstPointer = event.button === 0 && field !== document.activeElement ? field : null;
    };
    const focus = (event: FocusEvent) => { editable(event.target)?.select(); };
    const up = (event: MouseEvent) => {
      if (firstPointer && event.target === firstPointer && document.activeElement === firstPointer) {
        event.preventDefault(); firstPointer.select();
      }
      firstPointer = null;
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('mouseup', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('mouseup', up, true);
    };
  }, []);
}
