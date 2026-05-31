/**
 * Logger implementation
 */

import { Severity } from '../types';

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
};

export class Logger {
  private level: number;
  private prefix: string;
  private quiet: boolean;

  constructor(options: LoggerOptions = { level: 'info' }) {
    this.level = LOG_LEVELS[options.level];
    this.prefix = options.prefix || 'QA-Agent';
    this.quiet = options.quiet || false;
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

  child(prefix: string): Logger {
    return new Logger({
      level: Object.keys(LOG_LEVELS).find(
        k => LOG_LEVELS[k as keyof typeof LOG_LEVELS] === this.level
      ) as LoggerOptions['level'],
      prefix: `${this.prefix}:${prefix}`,
      quiet: this.quiet,
    });
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
