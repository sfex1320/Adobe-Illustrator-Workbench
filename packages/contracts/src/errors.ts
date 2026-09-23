/** 结构化错误。所有跨层错误都用 CoreErrorInfo，不允许吞错返回成功。 */

export type CoreErrorCode =
  // 宿主与桥接
  | 'HOST_NOT_CONNECTED'
  | 'HOST_TIMEOUT'
  | 'HOST_SCRIPT_ERROR'
  | 'HOST_MALFORMED_RESPONSE'
  | 'HOST_COMMAND_REJECTED'
  // 文档与引用
  | 'NO_DOCUMENT'
  | 'DOC_SESSION_MISMATCH'
  | 'REF_STALE'
  | 'SELECTION_EMPTY'
  // 能力与范围
  | 'CAPABILITY_UNSUPPORTED'
  | 'SCOPE_INVALID'
  // 模块
  | 'MODULE_DUPLICATE_ID'
  | 'MODULE_CONTRACT_MISMATCH'
  | 'MODULE_MISSING_CAPABILITY'
  | 'MODULE_DEPENDENCY_NOT_ALLOWED'
  | 'MODULE_NOT_ACTIVE'
  | 'MODULE_INVALID_MANIFEST'
  // 通用
  | 'INTERNAL_ERROR'
  | 'SETTINGS_CORRUPTED'
  | 'OPERATION_CANCELLED';

export interface CoreErrorInfo {
  code: CoreErrorCode;
  /** 面向用户的中文说明。 */
  message: string;
  /** 最小必要的上下文（不得包含完整稿件文字、绝对路径）。 */
  detail?: string;
  /** 是否可以安全重试（仅幂等读操作为 true）。 */
  retryable?: boolean;
}

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly detail?: string;
  readonly retryable: boolean;

  constructor(info: CoreErrorInfo) {
    super(info.message);
    this.name = 'CoreError';
    this.code = info.code;
    this.detail = info.detail;
    this.retryable = info.retryable ?? false;
  }

  toInfo(): CoreErrorInfo {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      retryable: this.retryable,
    };
  }
}

export function isCoreError(e: unknown): e is CoreError {
  return e instanceof CoreError;
}

export function toErrorInfo(e: unknown): CoreErrorInfo {
  if (isCoreError(e)) return e.toInfo();
  if (e instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: '发生未预期错误', detail: e.message };
  }
  return { code: 'INTERNAL_ERROR', message: '发生未预期错误' };
}
