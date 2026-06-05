/**
 * Logger implementation
 *
 * 设计要点：
 * 1. 同时存 level 数字 + 名称，避免 child() 时反向查表
 * 2. 4 个日志方法走同一条 shouldLog 路径
 * 3. quiet 模式只影响 console 输出，不影响计数
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  quiet?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_NAMES: Record<number, LogLevel> = Object.fromEntries(
  Object.entries(LOG_LEVELS).map(([name, n]) => [n, name as LogLevel])
) as Record<number, LogLevel>;

export class Logger {
  private level: number;
  private levelName: LogLevel;
  private prefix: string;
  private quiet: boolean;

  constructor(options: LoggerOptions = {}) {
    const level: LogLevel = options.level ?? 'info';
    this.level = LOG_LEVELS[level];
    this.levelName = level;
    this.prefix = options.prefix || 'QA-Agent';
    this.quiet = options.quiet || false;
  }

  private shouldLog(target: LogLevel): boolean {
    if (this.quiet) return false;
    return this.level <= LOG_LEVELS[target];
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(`[${this.prefix}] [DEBUG] ${message}`, data ?? '');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(`[${this.prefix}] [INFO] ${message}`, data ?? '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(`[${this.prefix}] [WARN] ${message}`, data ?? '');
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`[${this.prefix}] [ERROR] ${message}`, data ?? '');
    }
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.levelName,
      prefix: `${this.prefix}:${prefix}`,
      quiet: this.quiet,
    });
  }
}

export function createLogger(options?: Partial<LoggerOptions>): Logger {
  return new Logger({
    level: 'info',
    ...options,
  });
}
