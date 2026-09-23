/**
 * CEP 桥接协议：面板 → cs.evalScript → ExtendScript 宿主脚本。
 *
 * 安全与健壮性规则：
 * - 只发送白名单命令；参数经 JSON + encodeURIComponent 编码后拼接，
 *   引号、反斜线、中文、换行均不会改变可执行脚本结构（B04）；
 * - 每个请求带唯一 ID；宿主响应携带同一 ID；
 * - 超时后该请求立即失败但保持通道占用至实际回调（宿主动作未必已被取消，调用方不得自动重试非幂等写入）；
 *   迟到响应（ID 已不在等待表）直接丢弃，不覆盖新请求结果（B02）；
 * - 宿主报错与畸形返回分别映射为 HOST_SCRIPT_ERROR / HOST_MALFORMED_RESPONSE。
 */

import { CoreError } from '@aiq/contracts';

export type EvalScriptFunction = (script: string, callback: (result: string) => void) => void;

export const CEP_COMMAND_WHITELIST = [
  'PING',
  'GET_EDITOR_STATE',
  'GET_EDITOR_REVISION',
  'RELEASE_EDITOR_STATE',
  'EDIT_DOCUMENT',
  'SELECT_NATIVE_TOOL',
  'GET_DOCUMENT_CONTEXT',
  'LIST_DOCUMENT_NAMES',
  'COLLECT_SNAPSHOT',
  'SELECT_OBJECTS',
  'SET_TEXT_STYLES',
  'APPLY_TRANSFORMS',
  'REPLACE_OBJECTS',
  'APPLY_SYMMETRY',
  'CONVERT_OUTLINES',
  'EXPORT_FILES',
  'UNDO_WRITE',
] as const;

export type CepCommand = (typeof CEP_COMMAND_WHITELIST)[number];

export interface BridgeResponse<T> {
  id: string;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface BridgeDiagnostics {
  sent: number;
  completed: number;
  byCommand: Record<string, number>;
  timedOut: number;
  discardedLate: number;
  malformed: number;
}

let requestCounter = 0;

export class CepBridge {
  private executing = false;
  private completion: Promise<void> = Promise.resolve();
  idle(): Promise<void> { return this.completion; }
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (e: CoreError) => void; timer: ReturnType<typeof setTimeout>; label: string }
  >();
  readonly diagnostics: BridgeDiagnostics = { sent: 0, completed: 0, byCommand: {}, timedOut: 0, discardedLate: 0, malformed: 0 };

  constructor(
    private readonly evalScript: EvalScriptFunction,
    private readonly timeoutMs = 10000,
  ) {}

  isAllowed(command: string): command is CepCommand {
    return (CEP_COMMAND_WHITELIST as readonly string[]).includes(command);
  }

  send<T>(command: CepCommand, params?: Record<string, unknown>, waitMs = this.timeoutMs): Promise<T> {
    if (this.executing) return Promise.reject(new CoreError({ code: 'HOST_COMMAND_REJECTED', message: '宿主原调用尚未结束，未发送新请求', retryable: false }));
    if (!this.isAllowed(command)) {
      return Promise.reject(
        new CoreError({
          code: 'HOST_COMMAND_REJECTED',
          message: `命令不在白名单：${command}`,
        }),
      );
    }
    const id = `req-${Date.now()}-${++requestCounter}`;
    const payload = { id, command, params: params ?? {} };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    // encodeURIComponent 会转义双引号、反斜线与换行，encoded 可安全嵌入双引号字面量。
    const script = `AIQ.handle("${encoded}")`;

    this.executing = true;
    let complete!: () => void;
    this.completion = new Promise<void>(resolve => { complete = resolve; });
    let returned = false;
    const finished = () => { if (returned) return false; returned = true; this.executing = false; this.diagnostics.completed++; complete(); return true; };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          this.diagnostics.timedOut += 1;
          // 超时只结束界面等待；实际回调前保持物理通道，禁止叠加宿主调用。
          reject(
            new CoreError({
              code: 'HOST_TIMEOUT',
              message: `宿主响应超时：${command}`,
              detail: `requestId=${id} timeoutMs=${waitMs}`,
              retryable: false,
            }),
          );
        }
      }, waitMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        label: command,
      });
      this.diagnostics.sent += 1;
      this.diagnostics.byCommand[command] = (this.diagnostics.byCommand[command] ?? 0) + 1;

      try {
        this.evalScript(script, (raw) => {
          if (!finished()) return;
          this.handleRawResponse(id, raw, resolve, reject);
        });
      } catch (e) {
        finished();
        this.pending.delete(id);
        clearTimeout(timer);
        reject(
          new CoreError({
            code: 'HOST_SCRIPT_ERROR',
            message: `无法调用宿主脚本接口：${command}`,
            detail: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    });
  }

  private handleRawResponse<T>(
    id: string,
    raw: string,
    resolve: (value: T) => void,
    reject: (e: CoreError) => void,
  ): void {
    const entry = this.pending.get(id);
    if (!entry) {
      // 迟到响应：请求已超时或已被清理。丢弃并记录，绝不解析给新请求。
      this.diagnostics.discardedLate += 1;
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);

    if (typeof raw !== 'string') {
      this.diagnostics.malformed += 1;
      reject(new CoreError({ code: 'HOST_MALFORMED_RESPONSE', message: '宿主响应不是字符串' }));
      return;
    }
    if (raw === 'EvalScript error.' || raw.startsWith('EvalScript error')) {
      reject(
        new CoreError({
          code: 'HOST_SCRIPT_ERROR',
          message: `宿主脚本执行错误：${entry.label}`,
          detail: raw.slice(0, 200),
        }),
      );
      return;
    }

    let parsed: BridgeResponse<T>;
    try {
      parsed = JSON.parse(raw) as BridgeResponse<T>;
    } catch {
      this.diagnostics.malformed += 1;
      reject(
        new CoreError({
          code: 'HOST_MALFORMED_RESPONSE',
          message: `宿主返回无法解析：${entry.label}`,
          detail: raw.slice(0, 120),
        }),
      );
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || typeof parsed.id !== 'string' || typeof parsed.ok !== 'boolean') {
      this.diagnostics.malformed += 1;
      reject(
        new CoreError({
          code: 'HOST_MALFORMED_RESPONSE',
          message: `宿主返回缺少请求 ID：${entry.label}`,
        }),
      );
      return;
    }
    // 响应 ID 与发起请求不一致：畸形（宿主端实现保证回带 ID）。
    if (parsed.id !== id) {
      this.diagnostics.malformed += 1;
      reject(
        new CoreError({
          code: 'HOST_MALFORMED_RESPONSE',
          message: `宿主返回 ID 不匹配：${entry.label}`,
          detail: `期望 ${id}，实际 ${parsed.id}`,
        }),
      );
      return;
    }

    if (parsed.ok) {
      resolve(parsed.data as T);
    } else {
      reject(
        new CoreError({
          code: parsed.error?.code === 'CAPABILITY_UNSUPPORTED' ? 'CAPABILITY_UNSUPPORTED' : 'HOST_SCRIPT_ERROR',
          message: parsed.error?.message ?? `宿主报告错误：${entry.label}`,
          detail: parsed.error?.code,
        }),
      );
    }
  }
}

/** 从 CEP 环境构造 evalScript 函数；不在 CEP 中返回 null（连接失败，不静默演示）。 */
export function detectCepEvalScript(): EvalScriptFunction | null {
  const cep = (globalThis as { __adobe_cep__?: unknown }).__adobe_cep__;
  if (!cep) return null;
  const cs = cep as {
    evalScript?: (script: string, callback: (result: string) => void) => void;
  };
  if (typeof cs.evalScript !== 'function') return null;
  return (script, callback) => cs.evalScript!(script, callback);
}
