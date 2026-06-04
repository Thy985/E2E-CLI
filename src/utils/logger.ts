/**
 * Logger implementation
 *
 * 设计要点：
 * - `level` 通过对象引用（`levelRef`）在 parent/child 间共享
 * - `setLevel()` 修改 ref.v，所有引用同一 ref 的 logger 立即响应
 * - `quiet` 同理（`quietRef`）
 */

export interface LoggerOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  prefix?: string;
  quiet?: boolean;
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

export class Logger {
  private levelRef: { v: number };
  private quietRef: { v: boolean };
  private prefix: string;

  constructor(options: LoggerOptions = { level: 'info' }) {
    this.levelRef = { v: LOG_LEVELS[options.level] };
    this.quietRef = { v: options.quiet ?? false };
    this.prefix = options.prefix || 'QA-Agent';
  }

  private get level(): number {
    return this.levelRef.v;
  }

  private get quiet(): boolean {
    return this.quietRef.v;
  }

  debug(message: string, data?: any): void {
    if (this.level <= LOG_LEVELS.debug && !this.quiet) {
      console.log(`[${this.prefix}] [DEBUG] ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    if (this.level <= LOG_LEVELS.info && !this.quiet) {
      console.log(`[${this.prefix}] [INFO] ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.level <= LOG_LEVELS.warn && !this.quiet) {
      console.warn(`[${this.prefix}] [WARN] ${message}`, data || '');
    }
  }

  error(message: string, data?: any): void {
    if (this.level <= LOG_LEVELS.error && !this.quiet) {
      console.error(`[${this.prefix}] [ERROR] ${message}`, data || '');
    }
  }

  /**
   * Create a child logger. Shares `level` and `quiet` with the parent
   * (via shared object references) so setLevel() on the parent propagates.
   * The prefix is independent.
   */
  child(prefix: string): Logger {
    const child = new Logger({
      level: LEVEL_NAMES[this.level] ?? 'info',
      prefix: `${this.prefix}:${prefix}`,
      quiet: this.quiet,
    });
    child.levelRef = this.levelRef;
    child.quietRef = this.quietRef;
    return child;
  }

  /**
   * Update the active level. Propagates to any child created via #child().
   */
  setLevel(level: LoggerOptions['level']): void {
    this.levelRef.v = LOG_LEVELS[level];
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
