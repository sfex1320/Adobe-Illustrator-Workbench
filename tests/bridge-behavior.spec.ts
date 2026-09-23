/**
 * 桥接模拟必测案例 B01、B02、B04：超时、脚本报错、畸形返回、迟到响应、参数编码。
 * 用假 evalScript 模拟宿主——这证明桥接协议行为，不证明宿主接口存在。
 */

import { describe, expect, it } from 'vitest';
import { CepBridge } from '@aiq/host-adapter';

const SCRIPT_PREFIX = 'AIQ.handle("';

function parseId(script: string): string {
  const encoded = script.slice(SCRIPT_PREFIX.length, -2);
  const payload = JSON.parse(decodeURIComponent(encoded)) as { id: string };
  return payload.id;
}

function okResponse(id: string, data: unknown): string {
  return JSON.stringify({ id, ok: true, data });
}

function replyWith(script: string, cb: (result: string) => void, data: unknown): void {
  setTimeout(() => cb(okResponse(parseId(script), data)), 0);
}

describe('B01 超时、脚本报错、畸形返回', () => {
  it('超时映射为 HOST_TIMEOUT 且不可自动重试（写操作语义）', async () => {
    const bridge = new CepBridge(() => {
      /* 永不回调：模拟宿主卡死 */
    }, 20);
    const promise = bridge.send('PING');
    await expect(promise).rejects.toMatchObject({
      code: 'HOST_TIMEOUT',
      retryable: false,
    });
    expect(bridge.diagnostics.timedOut).toBe(1);
  });

  it('宿主脚本错误映射为 HOST_SCRIPT_ERROR', async () => {
    const bridge = new CepBridge((_script, cb) => {
      setTimeout(() => cb('EvalScript error.'), 0);
    }, 100);
    await expect(bridge.send('PING')).rejects.toMatchObject({ code: 'HOST_SCRIPT_ERROR' });
  });

  it('畸形返回（非 JSON）映射为 HOST_MALFORMED_RESPONSE', async () => {
    const bridge = new CepBridge((_script, cb) => {
      setTimeout(() => cb('not-json at all'), 0);
    }, 100);
    await expect(bridge.send('PING')).rejects.toMatchObject({ code: 'HOST_MALFORMED_RESPONSE' });
  });

  it('响应缺少 ID 按畸形处理', async () => {
    const bridge = new CepBridge((_script, cb) => {
      setTimeout(() => cb(JSON.stringify({ ok: true, data: {} })), 0);
    }, 100);
    await expect(bridge.send('PING')).rejects.toMatchObject({ code: 'HOST_MALFORMED_RESPONSE' });
  });

  it('白名单外命令直接拒绝', async () => {
    const bridge = new CepBridge((_script, cb) => {
      setTimeout(() => cb('unused'), 0);
    }, 100);
    expect(bridge.isAllowed('PING')).toBe(true);
    expect(bridge.isAllowed('EXECUTE_ARBITRARY_CODE')).toBe(false);
    await expect(
      bridge.send('EXECUTE_ARBITRARY_CODE' as never),
    ).rejects.toMatchObject({ code: 'HOST_COMMAND_REJECTED' });
  });

  it('宿主报告的业务错误保留 message', async () => {
    const bridge = new CepBridge((script, cb) => {
      const id = parseId(script);
      setTimeout(
        () =>
          cb(
            JSON.stringify({
              id,
              ok: false,
              error: { code: 'DOC_SESSION_MISMATCH', message: '文档会话不一致' },
            }),
          ),
        0,
      );
    }, 100);
    await expect(bridge.send('SELECT_OBJECTS')).rejects.toMatchObject({
      code: 'HOST_SCRIPT_ERROR',
      message: '文档会话不一致',
    });
  });
});

describe('B02 迟到响应不覆盖新请求结果', () => {
  it('超时请求的迟到响应被丢弃', async () => {
    const calls: Array<{ script: string; cb: (result: string) => void }> = [];
    const bridge = new CepBridge((script, cb) => {
      calls.push({ script, cb });
    }, 20);

    const first = bridge.send('PING');
    await expect(first).rejects.toMatchObject({ code: 'HOST_TIMEOUT' });

    await expect(bridge.send('PING')).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    expect(calls).toHaveLength(1);
    // 第一个（已超时）请求的迟到响应按 ID 丢弃，绝不覆盖第二个请求的结果。
    calls[0]!.cb(okResponse(parseId(calls[0]!.script), { pong: 1 }));
    const second = bridge.send<{ pong: number }>('PING');
    expect(calls).toHaveLength(2);
    calls[1]!.cb(okResponse(parseId(calls[1]!.script), { pong: 2 }));
    await expect(second).resolves.toEqual({ pong: 2 });
    expect(bridge.diagnostics.discardedLate).toBe(1);
    expect(bridge.diagnostics.timedOut).toBe(1);
    expect(bridge.diagnostics.sent).toBe(2);
  });

  it('连续请求各自配对，不串结果', async () => {
    let call = 0;
    const ids: string[] = [];
    const bridge = new CepBridge((script, cb) => {
      call += 1;
      ids.push(parseId(script));
      const mine = call;
      setTimeout(() => cb(okResponse(parseId(script), { n: mine })), mine === 1 ? 30 : 5);
    }, 500);

    const p1 = bridge.send<{ n: number }>('PING');
    await expect(bridge.send('PING')).rejects.toMatchObject({code:'HOST_COMMAND_REJECTED'});
    expect(await p1).toEqual({ n: 1 });
    const p2 = bridge.send<{ n: number }>('PING');
    expect(await p2).toEqual({ n: 2 });
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('B04 参数编码安全', () => {
  it('引号、反斜线、中文、换行不能改变可执行脚本结构', async () => {
    const scripts: string[] = [];
    const bridge = new CepBridge((script, cb) => {
      scripts.push(script);
      replyWith(script, cb, { echoed: null });
    }, 100);

    const hostile = {
      name: '含"双引号\'单引号 与\\\\反斜线\n换行 </script>',
      path: 'C:\\Users\\测试\\文件.ai',
      payload: '"; app.documents.close(); "',
    };
    await bridge.send('COLLECT_SNAPSHOT', hostile);

    // 脚本结构固定为 AIQ.handle("<percent-encoded>")：编码输出不含未转义的引号/反斜线/换行。
    const firstScript = scripts[0];
    if (!firstScript) throw new Error('未捕获到脚本');
    expect(firstScript).toMatch(/^AIQ\.handle\("[A-Za-z0-9%+._~()*!'-]*"\)$/);
    expect(firstScript).not.toContain('\\');
    expect(firstScript).not.toContain('\n');

    // 解码后载荷与原对象一致（往返无损）。
    const encoded = firstScript.slice(SCRIPT_PREFIX.length, -2);
    const decoded = JSON.parse(decodeURIComponent(encoded)) as {
      command: string;
      params: unknown;
    };
    expect(decoded.command).toBe('COLLECT_SNAPSHOT');
    expect(decoded.params).toEqual(hostile);
  });
});
