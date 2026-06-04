/**
 * Logger Tests
 *
 * Note: bun:test does not export `spyOn` (it ships `mock` instead).
 * We capture console calls into arrays and assert against them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Logger, createLogger } from '../../src/utils/logger';

type ConsoleCalls = { log: unknown[][]; warn: unknown[][]; error: unknown[][] };

const captured: ConsoleCalls = { log: [], warn: [], error: [] };
const original = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function reset(): void {
  captured.log.length = 0;
  captured.warn.length = 0;
  captured.error.length = 0;
}

beforeEach(() => {
  reset();
  console.log = (...args: unknown[]) => {
    captured.log.push(args);
  };
  console.warn = (...args: unknown[]) => {
    captured.warn.push(args);
  };
  console.error = (...args: unknown[]) => {
    captured.error.push(args);
  };
});

afterEach(() => {
  console.log = original.log;
  console.warn = original.warn;
  console.error = original.error;
});

function findCall(calls: unknown[][], predicate: (msg: string) => boolean): boolean {
  return calls.some((call) => typeof call[0] === 'string' && predicate(call[0]));
}

describe('Logger', () => {
  describe('constructor', () => {
    it('should create logger with default options', () => {
      const logger = new Logger();
      expect(logger).toBeDefined();
    });

    it('should create logger with custom level', () => {
      const logger = new Logger({ level: 'error' });
      expect(logger).toBeDefined();
    });

    it('should create logger with custom prefix', () => {
      const logger = new Logger({ prefix: 'Test' });
      expect(logger).toBeDefined();
    });
  });

  describe('debug', () => {
    it('should log debug message when level is debug', () => {
      const logger = new Logger({ level: 'debug' });
      logger.debug('test message');
      expect(captured.log.length).toBe(1);
      expect(captured.log[0][0]).toContain('[QA-Agent]');
      expect(captured.log[0][0]).toContain('test message');
    });

    it('should not log debug message when level is info', () => {
      const logger = new Logger({ level: 'info' });
      logger.debug('test message');
      expect(captured.log.length).toBe(0);
    });
  });

  describe('info', () => {
    it('should log info message when level is info', () => {
      const logger = new Logger({ level: 'info' });
      logger.info('test message');
      expect(captured.log.length).toBe(1);
      expect(captured.log[0][0]).toContain('[INFO]');
      expect(captured.log[0][0]).toContain('test message');
    });

    it('should log info message with data', () => {
      const logger = new Logger({ level: 'info' });
      const data = { key: 'value' };
      logger.info('test message', data);
      expect(captured.log.length).toBe(1);
      expect(captured.log[0][0]).toContain('[INFO]');
      expect(captured.log[0][1]).toEqual(data);
    });
  });

  describe('warn', () => {
    it('should log warn message', () => {
      const logger = new Logger({ level: 'warn' });
      logger.warn('test message');
      expect(captured.warn.length).toBe(1);
      expect(captured.warn[0][0]).toContain('[WARN]');
    });

    it('should not log warn message when level is error', () => {
      const logger = new Logger({ level: 'error' });
      logger.warn('test message');
      expect(captured.warn.length).toBe(0);
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      const logger = new Logger({ level: 'error' });
      logger.error('test message');
      expect(captured.error.length).toBe(1);
      expect(captured.error[0][0]).toContain('[ERROR]');
    });
  });

  describe('child', () => {
    it('should create child logger with updated prefix', () => {
      const parent = new Logger({ prefix: 'Parent', level: 'debug' });
      const child = parent.child('Child');

      child.info('test');

      expect(captured.log.length).toBe(1);
      expect(captured.log[0][0]).toContain('Parent:Child');
    });

    it('should preserve log level from parent (debug → child can debug)', () => {
      const parent = new Logger({ level: 'debug' });
      const child = parent.child('Child');

      child.debug('test');

      expect(captured.log.length).toBe(1);
      expect(captured.log[0][0]).toContain('[DEBUG]');
    });

    it('should propagate setLevel() from parent to child', () => {
      const parent = new Logger({ level: 'info' });
      const child = parent.child('Inner');

      parent.setLevel('debug');
      child.debug('after-setLevel');

      expect(findCall(captured.log, (m) => m.includes('[DEBUG]'))).toBe(true);
    });
  });

  describe('quiet mode', () => {
    it('should not log anything when quiet is true', () => {
      const logger = new Logger({ level: 'debug', quiet: true });
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');

      expect(captured.log.length).toBe(0);
      expect(captured.warn.length).toBe(0);
      expect(captured.error.length).toBe(0);
    });
  });
});

describe('createLogger', () => {
  it('should create logger with default options', () => {
    const logger = createLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('should create logger with custom options', () => {
    const logger = createLogger({ level: 'warn', prefix: 'Custom' });
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe('Logger v0.4 json format', () => {
  it('defaults to text format and produces the legacy [prefix] [LEVEL] string', () => {
    const logger = new Logger({ level: 'info' });
    logger.info('hello');
    expect(captured.log.length).toBe(1);
    expect(captured.log[0][0]).toContain('[QA-Agent]');
    expect(captured.log[0][0]).toContain('[INFO]');
    expect(captured.log[0][0]).toContain('hello');
  });

  it('emits a single-line JSON object when format=json', () => {
    const logger = new Logger({ level: 'info', format: 'json' });
    logger.info('structured');
    expect(captured.log.length).toBe(1);
    const raw = captured.log[0][0] as string;
    const obj = JSON.parse(raw);
    expect(obj.level).toBe('info');
    expect(obj.prefix).toBe('QA-Agent');
    expect(obj.message).toBe('structured');
    expect(typeof obj.ts).toBe('string');
    // Single-line guarantee (no embedded \n).
    expect(raw.includes('\n')).toBe(false);
  });

  it('includes a data field when format=json and data is provided', () => {
    const logger = new Logger({ level: 'info', format: 'json' });
    logger.info('with-data', { count: 3, items: ['a', 'b'] });
    const obj = JSON.parse(captured.log[0][0] as string);
    expect(obj.data).toEqual({ count: 3, items: ['a', 'b'] });
  });

  it('omits the data field when format=json and data is undefined', () => {
    const logger = new Logger({ level: 'info', format: 'json' });
    logger.info('no-data');
    const obj = JSON.parse(captured.log[0][0] as string);
    expect('data' in obj).toBe(false);
  });

  it('routes warn/error to console.warn/console.error in json mode', () => {
    const logger = new Logger({ level: 'debug', format: 'json' });
    logger.warn('w');
    logger.error('e');
    expect(captured.warn.length).toBe(1);
    expect(captured.error.length).toBe(1);
    expect(JSON.parse(captured.warn[0][0] as string).level).toBe('warn');
    expect(JSON.parse(captured.error[0][0] as string).level).toBe('error');
  });

  it('setFormat() flips the format and propagates to child loggers', () => {
    const parent = new Logger({ level: 'info' });
    const child = parent.child('Sub');

    parent.setFormat('json');
    parent.info('p-json');
    child.info('c-json');

    expect(captured.log.length).toBe(2);
    const pObj = JSON.parse(captured.log[0][0] as string);
    const cObj = JSON.parse(captured.log[1][0] as string);
    expect(pObj.message).toBe('p-json');
    expect(cObj.message).toBe('c-json');
    expect(cObj.prefix).toBe('QA-Agent:Sub');
  });

  it('serializes non-JSON values as a string fallback in json mode', () => {
    const logger = new Logger({ level: 'info', format: 'json' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logger.info('circular', circular);
    const obj = JSON.parse(captured.log[0][0] as string);
    expect(typeof obj.data).toBe('string');
  });
});
