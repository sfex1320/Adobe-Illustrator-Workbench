import {useEffect,useState} from 'react';
/**
 * 0.6.29 全局操作提示条：即时结果不再插进表单流（会引起面板抖动），
 * 统一发布到底部快捷工具条下方的常驻细提示条，直到被下一条提示替换。
 */
interface FeedbackState { message: string; error: string }
let latest: FeedbackState = { message: '', error: '' };
const listeners = new Set<(state: FeedbackState) => void>();
export function publishFeedback(message: string, error: string) {
  latest = { message, error };
  for (const notify of listeners) notify(latest);
}
export function StatusBar() {
  const [state, setState] = useState(latest);
  useEffect(() => {
    listeners.add(setState);
    setState(latest);
    return () => { listeners.delete(setState); };
  }, []);
  return <div className="wb-status-bar" role={state.error ? 'alert' : 'status'} aria-live="polite" data-empty={!state.message && !state.error}>
    <span title={state.error || state.message || '就绪'} className={state.error ? 'is-error' : undefined}>{state.error || state.message || '就绪'}</span>
  </div>;
}
