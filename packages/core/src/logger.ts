/** 日志端口实现：带前缀，debug 默认静默。日志不得输出完整稿件文字或绝对路径。 */

import type { LogPort } from '@aiq/contracts';

export class Logger implements LogPort {
  constructor(
    private readonly prefix: string,
    private readonly sinks: { debug?: boolean } = {},
  ) {}

  private output(level: 'log' | 'info' | 'warn' | 'error', message: string, detail?: Record<string, unknown>): void {
    const line = `[${this.prefix}] ${message}`;
    console[level](line, detail ?? '');
  }

  debug(message: string, detail?: Record<string, unknown>): void {
    if (this.sinks.debug) this.output('log', message, detail);
  }

  info(message: string, detail?: Record<string, unknown>): void {
    this.output('info', message, detail);
  }

  warn(message: string, detail?: Record<string, unknown>): void {
    this.output('warn', message, detail);
  }

  error(message: string, detail?: Record<string, unknown>): void {
    this.output('error', message, detail);
  }
}
