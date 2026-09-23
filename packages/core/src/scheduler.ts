import { CoreError } from '@aiq/contracts';
import type { SchedulerPort, SchedulerTaskOptions } from '@aiq/contracts';

/** UI timeout never releases the physical host lane. No automatic retries. */
export class Scheduler implements SchedulerPort {
  private queue: Array<{ start: () => void; cancel: () => void }> = [];
  private active = false;
  private uncertain = false;
  private waiters: Array<() => void> = [];
  constructor(private readonly hostIdle: () => Promise<void> = async () => {}, private readonly maxQueue = 8) {}
  idle(): Promise<void> {
    return this.isIdle() ? Promise.resolve() : new Promise(resolve => this.waiters.push(resolve));
  }
  isIdle(): boolean { return !this.active && this.queue.length === 0; }
  getDiagnostics() { return { active: this.active, uncertain: this.uncertain, queued: this.queue.length, maxQueue: this.maxQueue }; }
  cancelPending(): void { for (const entry of this.queue.splice(0)) entry.cancel(); }
  private drain(): void {
    if (this.active) return;
    const next = this.queue.shift();
    if (next) next.start();
    else for (const resolve of this.waiters.splice(0)) resolve();
  }
  run<T>(label: string, task: () => Promise<T>, opts: SchedulerTaskOptions = {}): Promise<T> {
    if (this.uncertain || this.queue.length >= this.maxQueue) return Promise.reject(new CoreError({
      code: 'HOST_COMMAND_REJECTED', message: this.uncertain ? '宿主上次操作尚未结束，请等待实际返回后手动重试' : '任务队列已满，请稍后手动操作',
    }));
    return new Promise<T>((resolve, reject) => {
      const cancelled = () => reject(new CoreError({ code: 'OPERATION_CANCELLED', message: '任务已失去用途，未发送到宿主' }));
      const entry = { cancel: cancelled, start: () => {
        opts.signal?.removeEventListener('abort', abort);
        if (opts.signal?.aborted) { cancelled(); this.drain(); return; }
        this.active = true;
        const timer = setTimeout(() => {
          this.uncertain = true;
          this.cancelPending();
          reject(new CoreError({ code: 'HOST_TIMEOUT', message: `等待超时：${label}；宿主可能仍在执行，通道暂停至原调用结束`, retryable: false }));
        }, opts.timeoutMs ?? 15000);
        void (async () => {
          try { resolve(await task()); }
          catch (error) {
            if (error instanceof CoreError && error.code === 'HOST_TIMEOUT') { this.uncertain = true; this.cancelPending(); }
            reject(error);
          } finally {
            clearTimeout(timer);
            // CEP may reject its UI promise long before evalScript returns.
            await this.hostIdle();
            this.active = false;
            this.uncertain = false;
            this.drain();
          }
        })();
      } };
      const abort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) { this.queue.splice(index, 1); cancelled(); }
      };
      if (opts.signal?.aborted) { cancelled(); return; }
      opts.signal?.addEventListener('abort', abort, { once: true });
      entry.cancel = () => { opts.signal?.removeEventListener('abort', abort); cancelled(); };
      this.queue.push(entry);
      this.drain();
    });
  }
}
