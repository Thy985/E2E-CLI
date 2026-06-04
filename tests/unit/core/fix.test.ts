/**
 * Tests for core/fix — applyFixes (pure I/O, no registry).
 *
 * Covers: replace change, insert change, error reporting, requireExisting safety.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { applyFixes } from '../../../src/core/fix';
import { Fix } from '../../../src/types';

function makeFix(changes: Fix['changes']): Fix {
  return {
    id: 'fix-1',
    description: 'test fix',
    changes,
    confidence: 1.0,
  };
}

describe('core/fix.applyFixes', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-fix-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applies a replace change', async () => {
    const file = path.join(tmpDir, 'a.txt');
    await fs.writeFile(file, 'hello world');
    const fix = makeFix([
      {
        file: 'a.txt',
        type: 'replace',
        oldContent: 'world',
        content: 'bun',
        line: 1,
      },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(await fs.readFile(file, 'utf-8')).toBe('hello bun');
  });

  it('applies an insert change at a specific line', async () => {
    const file = path.join(tmpDir, 'b.txt');
    await fs.writeFile(file, 'line1\nline2');
    const fix = makeFix([
      {
        file: 'b.txt',
        type: 'insert',
        content: 'inserted',
        position: { line: 2 },
      },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(1);
    expect(await fs.readFile(file, 'utf-8')).toBe('line1\ninserted\nline2');
  });

  it('creates parent directories for new files', async () => {
    const fix = makeFix([
      {
        file: 'nested/dir/c.txt',
        type: 'insert',
        content: 'first line',
        position: { line: 1 },
      },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(1);
    expect(await fs.readFile(path.join(tmpDir, 'nested/dir/c.txt'), 'utf-8')).toBe('first line');
  });

  it('inserts into an empty new file without producing a trailing newline', async () => {
    const file = path.join(tmpDir, 'fresh.txt');
    const fix = makeFix([
      { file: 'fresh.txt', type: 'insert', content: 'hello', position: { line: 1 } },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(1);
    // Regression guard for the `''.split('\n')` trailing-newline bug.
    const content = await fs.readFile(file, 'utf-8');
    expect(content).toBe('hello');
    expect(content.endsWith('\n')).toBe(false);
  });

  it('preserves trailing newline when the inserted content already has one', async () => {
    const file = path.join(tmpDir, 'crlf.txt');
    const fix = makeFix([
      { file: 'crlf.txt', type: 'insert', content: 'hello\n', position: { line: 1 } },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(1);
    expect(await fs.readFile(file, 'utf-8')).toBe('hello\n');
  });

  it('reports failed changes in errors list without throwing', async () => {
    const fix = makeFix([
      {
        file: 'nonexistent.txt',
        type: 'replace',
        oldContent: 'a',
        content: 'b',
        line: 1,
      },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('processes multiple fixes and reports mixed results', async () => {
    const fileA = path.join(tmpDir, 'a.txt');
    const fileB = path.join(tmpDir, 'b.txt');
    await fs.writeFile(fileA, 'foo');
    await fs.writeFile(fileB, 'bar');

    const fix1 = makeFix([{ file: 'a.txt', type: 'replace', oldContent: 'foo', content: 'baz', line: 1 }]);
    const fix2 = makeFix([{ file: 'b.txt', type: 'replace', oldContent: 'WRONG', content: 'baz', line: 1 }]);
    const fix3 = makeFix([{ file: 'a.txt', type: 'replace', oldContent: 'baz', content: 'qux', line: 1 }]);

    const result = await applyFixes({
      fixes: [{ fix: fix1 }, { fix: fix2 }, { fix: fix3 }],
      projectPath: tmpDir,
    });

    expect(result.applied).toBe(2);
    expect(result.failed).toBe(1);
    expect(await fs.readFile(fileA, 'utf-8')).toBe('qux');
  });

  it('rejects unsupported change types', async () => {
    const fix = makeFix([
      { file: 'a.txt', type: 'unsupported' as never, line: 1 },
    ]);
    const result = await applyFixes({ fixes: [{ fix }], projectPath: tmpDir });
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('Unsupported change type');
  });
});
