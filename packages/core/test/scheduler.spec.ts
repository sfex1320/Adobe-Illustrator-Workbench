/** 调度器：串行执行、超时、队列不断链。 */

import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/scheduler.js';

describe('Scheduler', () => {
  it('串行执行：后一个任务等待前一个完成', async () => {
    const scheduler = new Scheduler();
    const order: number[] = [];
    const p1 = scheduler.run('a', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const p2 = scheduler.run('b', async () => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('等待超时后锁定通道，原调用结束后才可手动发起新任务', async () => {
    const scheduler = new Scheduler();
    let finish!: () => void;
    const slow = scheduler.run('slow', () => new Promise<void>(resolve => { finish=resolve; }), {timeoutMs:10});
    const queued = scheduler.run('obsolete write', async () => { throw Error('must not run'); });
    const cancelled = expect(queued).rejects.toMatchObject({code:'OPERATION_CANCELLED'});
    await expect(slow).rejects.toMatchObject({code:'HOST_TIMEOUT',retryable:false});
    await cancelled;
    expect(scheduler.getDiagnostics()).toMatchObject({active:true,uncertain:true,queued:0});
    await expect(scheduler.run('after', async () => 'ok')).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    finish();await scheduler.idle();
    await expect(scheduler.run('manual retry', async () => 'ok')).resolves.toBe('ok');
  });

  it('任务失败不阻断后续任务', async () => {
    const scheduler = new Scheduler();
    const failing = scheduler.run('failing', async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await expect(scheduler.run('next', async () => 42)).resolves.toBe(42);
  });

  it('idle() 等待队列清空', async () => {
    const scheduler = new Scheduler();
    void scheduler.run('a', () => new Promise<void>((r) => setTimeout(r, 10)));
    await scheduler.idle();
    expect(scheduler.isIdle()).toBe(true);
  });
});
