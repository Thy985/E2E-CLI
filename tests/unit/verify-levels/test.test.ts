/**
 * Level 2 (test) 单元测试
 *
 * 覆盖 parseXxxOutput 系列（jest / vitest / bun / mocha / ava / generic）
 * + detectNewTestFailures
 *
 * 不测试 runTests 真实执行（依赖 spawn 进程 + 真实测试 runner），
 * 该部分在集成测试 / dev 工作流覆盖。
 */

import { describe, it, expect } from 'bun:test';
import {
  parseTestOutput,
  detectTestRunRunner as _runnerDetect, // type re-export not used; we'll just call parseTestOutput
  detectNewTestFailures,
} from '../../../src/engines/verify/levels/test';
import type { TestRunResult } from '../../../src/engines/verify/levels/types';

describe('Level 2: test - parseTestOutput', () => {
  describe('jest output', () => {
    it('parses standard pass/fail/skip', () => {
      const output = 'Tests: 5 passed, 2 failed, 1 skipped';
      const r = parseTestOutput(output, 'jest');
      expect(r.passed).toBe(5);
      expect(r.failed).toBe(2);
      expect(r.skipped).toBe(1);
      expect(r.total).toBe(8);
    });

    it('returns 0 for all fields on empty output', () => {
      const r = parseTestOutput('', 'jest');
      expect(r.passed).toBe(0);
      expect(r.failed).toBe(0);
      expect(r.total).toBe(0);
    });

    it('extracts failed test names from jest ✕ markers', () => {
      const output = `
PASS src/a.test.ts
✕ fails first
  ✓ passes
✕ fails second
  `;
      const r = parseTestOutput(output, 'jest');
      expect(r.failedTests).toBeDefined();
      expect(r.failedTests!.length).toBe(2);
      expect(r.failedTests![0]).toContain('fails');
    });
  });

  describe('vitest output', () => {
    it('parses standard pass/fail/skip', () => {
      const output = 'Test Files  3 passed (3)\n     Tests  12 passed (12)';
      const r = parseTestOutput(output, 'vitest');
      expect(r.passed).toBe(12);
    });

    it('parses failed tests in vitest', () => {
      const output = 'Tests  2 failed | 10 passed (12)';
      const r = parseTestOutput(output, 'vitest');
      expect(r.passed).toBe(10);
      expect(r.failed).toBe(2);
    });
  });

  describe('bun test output', () => {
    it('parses pass/fail/skip from bun', () => {
      const output = ' 12 pass\n 2 fail\n 0 skip\n 14 total';
      const r = parseTestOutput(output, 'bun');
      expect(r.passed).toBe(12);
      expect(r.failed).toBe(2);
      expect(r.skipped).toBe(0);
      expect(r.total).toBe(14);
    });

    it('extracts failed test names from bun ✗ markers', () => {
      const output = `
✓ should pass
✗ should fail with error
✗ another failure
      `;
      const r = parseTestOutput(output, 'bun');
      expect(r.failedTests).toBeDefined();
      expect(r.failedTests!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('mocha output', () => {
    it('parses passing/failing/pending counts', () => {
      const output = '  5 passing (1s)\n  2 failing\n  1 pending';
      const r = parseTestOutput(output, 'mocha');
      expect(r.passed).toBe(5);
      expect(r.failed).toBe(2);
      expect(r.skipped).toBe(1);
      expect(r.total).toBe(8);
    });
  });

  describe('ava output', () => {
    it('parses passed/failed/skipped', () => {
      const output = '  3 tests passed\n  1 test failed\n  1 test skipped';
      const r = parseTestOutput(output, 'ava');
      expect(r.passed).toBe(3);
      expect(r.failed).toBe(1);
      expect(r.skipped).toBe(1);
    });
  });

  describe('generic output (unknown runner)', () => {
    it('falls back to generic pattern matching', () => {
      const output = 'Tests: 7 passed, 2 failed';
      const r = parseTestOutput(output, 'unknown');
      expect(r.passed).toBe(7);
      expect(r.failed).toBe(2);
    });

    it('returns 0/0/0/0 for unrecognized output', () => {
      const r = parseTestOutput('garbled output', 'unknown');
      expect(r.passed).toBe(0);
      expect(r.failed).toBe(0);
      expect(r.total).toBe(0);
    });
  });
});

describe('Level 2: test - detectNewTestFailures', () => {
  function makeResult(failedTests: string[]): TestRunResult {
    return {
      success: failedTests.length === 0,
      passed: 0,
      failed: failedTests.length,
      skipped: 0,
      total: failedTests.length,
      output: '',
      runner: 'bun',
      failedTests,
    };
  }

  it('returns empty array when before is undefined', () => {
    expect(detectNewTestFailures(undefined, makeResult(['x']))).toEqual([]);
  });

  it('returns empty array when after is undefined', () => {
    expect(detectNewTestFailures(makeResult(['x']), undefined)).toEqual([]);
  });

  it('returns empty array when both have same failures', () => {
    const before = makeResult(['a', 'b']);
    const after = makeResult(['a', 'b']);
    expect(detectNewTestFailures(before, after)).toEqual([]);
  });

  it('detects newly introduced failure', () => {
    const before = makeResult(['a']);
    const after = makeResult(['a', 'b']);
    expect(detectNewTestFailures(before, after)).toEqual(['b']);
  });

  it('ignores tests that passed after fix', () => {
    const before = makeResult(['a', 'b']);
    const after = makeResult(['a']);
    expect(detectNewTestFailures(before, after)).toEqual([]);
  });

  it('handles multiple new failures', () => {
    const before = makeResult(['a']);
    const after = makeResult(['a', 'b', 'c', 'd']);
    expect(detectNewTestFailures(before, after)).toEqual(['b', 'c', 'd']);
  });
});
