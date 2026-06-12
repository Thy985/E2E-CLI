/**
 * Level 1 (compile) 单元测试
 *
 * 覆盖：
 * - countTscErrors: tsc 输出解析（各种 error 格式 / 无 error / 空输出 / mixed warning+error）
 *
 * 真实 spawn tsc 的端到端测试不写（依赖外部 fs fixture + tsc 安装），
 * 由集成测试 / dev 工作流覆盖。
 */

import { describe, it, expect } from 'bun:test';
import { countTscErrors } from '../../../src/engines/verify/levels/compile';

describe('Level 1: compile - countTscErrors', () => {
  it('returns 0 for empty output', () => {
    expect(countTscErrors('')).toBe(0);
  });

  it('returns 0 for clean compile output (no errors)', () => {
    const output = 'No errors found.\nCompilation complete.';
    expect(countTscErrors(output)).toBe(0);
  });

  it('counts a single tsc error line', () => {
    const output = 'src/foo.ts(10,5): error TS2304: Cannot find name "x".';
    expect(countTscErrors(output)).toBe(1);
  });

  it('counts multiple tsc error lines', () => {
    const output = [
      'src/a.ts(1,1): error TS2304: Cannot find name "x".',
      'src/b.ts(5,10): error TS2322: Type "string" is not assignable to "number".',
      'src/c.ts(20,3): error TS2532: Object is possibly "undefined".',
    ].join('\n');
    expect(countTscErrors(output)).toBe(3);
  });

  it('ignores non-error tsc output (info/warning lines)', () => {
    const output = [
      'Found 0 errors. Watching for file changes.',
      'tsconfig.json: 5.4.5',
      'Starting compilation in watch mode...',
    ].join('\n');
    expect(countTscErrors(output)).toBe(0);
  });

  it('counts only error lines in mixed output', () => {
    const output = [
      'Compiling project...',
      'src/a.ts(1,1): error TS2304: Cannot find name "x".',
      'warning: deprecated option "esModuleInterop"',
      'src/b.ts(5,10): error TS2322: Type mismatch.',
      'Done in 2.3s.',
    ].join('\n');
    expect(countTscErrors(output)).toBe(2);
  });

  it('handles windows-style path in error line', () => {
    const output = 'C:\\project\\src\\foo.ts(10,5): error TS2304: Cannot find name "x".';
    expect(countTscErrors(output)).toBe(1);
  });
});
