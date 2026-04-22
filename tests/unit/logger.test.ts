/**
 * Logger Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, createLogger, LoggerOptions } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

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
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[QA-Agent]'),
        ''
      );
    });

    it('should not log debug message when level is info', () => {
      const logger = new Logger({ level: 'info' });
      logger.debug('test message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info message when level is info', () => {
      const logger = new Logger({ level: 'info' });
      logger.info('test message');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        ''
      );
    });

    it('should log info message with data', () => {
      const logger = new Logger({ level: 'info' });
      const data = { key: 'value' };
      logger.info('test message', data);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        data
      );
    });
  });

  describe('warn', () => {
    it('should log warn message', () => {
      const logger = new Logger({ level: 'warn' });
      logger.warn('test message');
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        ''
      );
    });

    it('should not log warn message when level is error', () => {
      const logger = new Logger({ level: 'error' });
      logger.warn('test message');
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      const logger = new Logger({ level: 'error' });
      logger.error('test message');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        ''
      );
    });
  });

  describe('child', () => {
    it('should create child logger with updated prefix', () => {
      const parent = new Logger({ prefix: 'Parent', level: 'debug' });
      const child = parent.child('Child');

      child.info('test');

      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0];
      expect(call[0]).toContain('Parent:Child');
    });

    it('should preserve log level from parent', () => {
      const parent = new Logger({ level: 'debug' });
      const child = parent.child('Child');

      child.debug('test');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('quiet mode', () => {
    it('should not log anything when quiet is true', () => {
      const logger = new Logger({ level: 'debug', quiet: true });
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
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
