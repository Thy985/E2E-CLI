/**
 * Logger implementation
 *
 * 设计要点：
 * - `level` 通过对象引用（`levelRef`）在 parent/child 间共享
 * - `setLevel()` 修改 ref.v，所有引用同一 ref 的 logger 立即响应
 * - `quiet` 同理（`quietRef`）
 *
 * v0.4 输出格式：
 * - `text`（默认）：人类可读，保留 v0.3 之前的 `[prefix] [LEVEL] message` 格式
 * - `json`：JSON Lines，每行一个事件 `{ts, level, prefix, message, data?}`，方便
 *   CI/Vector/Loki/Cloud Logging 等下游消费
 * - 切换方式：构造函数传 `format: 'json'`，或环境变量 `QA_AGENT_LOG_FORMAT=json`
 */

export type LogFormat = 'text' | 'json';

export interface LoggerOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  prefix?: string;
  quiet?: boolean;
  format?: LogFormat;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

const LEVEL_NAMES: Record<number, LoggerOptions['level']> = {
  0: 'debug',
  1: 'info',
  2: 'warn',
  3: 'error',
};

/**
 * Resolve the effective log format:
 *  1. explicit option wins
 *  2. else `QA_AGENT_LOG_FORMAT` env var (case-insensitive: 'json' / 'text')
 *  3. else default 'text'
 */
function resolveFormat(option: LogFormat | undefined): LogFormat {
  if (option === 'json' || option === 'text') return option;
  const env = (typeof process !== 'undefined' && process.env?.QA_AGENT_LOG_FORMAT) || '';
  const normalized = env.trim().toLowerCase();
  if (normalized === 'json' || normalized === 'text') return normalized;
  return 'text';
}

/**
 * Best-effort serialize unknown `data` for the JSON formatter.
 * Falls back to `String(data)` if the value can't be JSON-serialized
 * (e.g. circular references, BigInt).
 */
function safeSerialize(data: unknown): unknown {
  if (data === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    try {
      return String(data);
    } catch {
      return '<unserializable>';
    }
  }
}

export class Logger {
  private levelRef: { v: number };
  private quietRef: { v: boolean };
  private formatRef: { v: LogFormat };
  private prefix: string;

  constructor(options: LoggerOptions = { level: 'info' }) {
    this.levelRef = { v: LOG_LEVELS[options.level] };
    this.quietRef = { v: options.quiet ?? false };
    this.formatRef = { v: resolveFormat(options.format) };
    this.prefix = options.prefix || 'QA-Agent';
  }

  private get level(): number {
    return this.levelRef.v;
  }

  private get quiet(): boolean {
    return this.quietRef.v;
  }

  private get format(): LogFormat {
    return this.formatRef.v;
  }

  /**
   * Lowest-level emit. `text` writes `[prefix] [LEVEL] message` to the
   * matching console method; `json` writes a single-line JSON object
   * containing the timestamp, level, prefix, message, and (if present)
   * the data field.
   */
  private emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (this.quiet) return;
    if (this.level > LOG_LEVELS[level]) return;
    if (this.format === 'json') {
      const payload: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        prefix: this.prefix,
        message,
      };
      const serialized = safeSerialize(data);
      if (serialized !== undefined) payload.data = serialized;
      const line = JSON.stringify(payload);
      switch (level) {
        case 'debug':
        case 'info':
          console.log(line);
          break;
        case 'warn':
          console.warn(line);
          break;
        case 'error':
          console.error(line);
          break;
      }
      return;
    }
    // text format — keep the historical v0.3 output so local dev reads the same.
    switch (level) {
      case 'debug':
        console.log(`[${this.prefix}] [DEBUG] ${message}`, data ?? '');
        break;
      case 'info':
        console.log(`[${this.prefix}] [INFO] ${message}`, data ?? '');
        break;
      case 'warn':
        console.warn(`[${this.prefix}] [WARN] ${message}`, data ?? '');
        break;
      case 'error':
        console.error(`[${this.prefix}] [ERROR] ${message}`, data ?? '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.emit('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.emit('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.emit('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.emit('error', message, data);
  }

  /**
   * Create a child logger. Shares `level`, `quiet`, and `format` with the
   * parent (via shared object references) so setLevel() / setFormat() on
   * the parent propagates. The prefix is independent.
   */
  child(prefix: string): Logger {
    const child = new Logger({
      level: LEVEL_NAMES[this.level] ?? 'info',
      prefix: `${this.prefix}:${prefix}`,
      quiet: this.quiet,
      format: this.format,
    });
    child.levelRef = this.levelRef;
    child.quietRef = this.quietRef;
    child.formatRef = this.formatRef;
    return child;
  }

  /**
   * Update the active level. Propagates to any child created via #child().
   */
  setLevel(level: LoggerOptions['level']): void {
    this.levelRef.v = LOG_LEVELS[level];
  }

  /**
   * Update the active format. Propagates to any child created via #child().
   */
  setFormat(format: LogFormat): void {
    this.formatRef.v = format;
  }
}

/**
 * Create default logger instance
 */
export function createLogger(options?: Partial<LoggerOptions>): Logger {
  return new Logger({
    level: 'info',
    ...options,
  });
}
