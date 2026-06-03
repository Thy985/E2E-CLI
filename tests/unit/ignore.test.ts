/**
 * Tests for ignore pattern matching utilities
 */

import { describe, it, expect } from 'bun:test';
import {
  shouldIgnore,
  matchesAnyPattern,
  matchesPattern,
  isInNodeModules,
  shouldIgnoreLine,
  shouldIgnoreSection,
} from '../../src/utils/ignore';

describe('matchesPattern', () => {
  it('should match **/*', () => {
    expect(matchesPattern('any/file.ts', '**/*')).toBe(true);
  });

  it('should match **/*.ext patterns', () => {
    expect(matchesPattern('a/b/c.min.js', '**/*.min.js')).toBe(true);
    expect(matchesPattern('a/b/c.ts', '**/*.min.js')).toBe(false);
  });

  it('should match dir/** patterns', () => {
    expect(matchesPattern('dist/foo.js', 'dist/**')).toBe(true);
    expect(matchesPattern('src/foo.js', 'dist/**')).toBe(false);
  });

  it('should match **/name patterns', () => {
    expect(matchesPattern('a/b/foo.ts', '**/foo.ts')).toBe(true);
    expect(matchesPattern('a/foo.ts', '**/foo.ts')).toBe(true);
    expect(matchesPattern('a/bar.ts', '**/foo.ts')).toBe(false);
  });

  it('should match simple wildcard patterns', () => {
    expect(matchesPattern('a/b/c.test.ts', '**/*.test.ts')).toBe(true);
  });

  it('should match exact paths', () => {
    expect(matchesPattern('foo/bar.ts', 'foo/bar.ts')).toBe(true);
    expect(matchesPattern('foo/bar.ts', 'foo/baz.ts')).toBe(false);
  });
});

describe('matchesAnyPattern', () => {
  it('returns true when at least one pattern matches', () => {
    expect(matchesAnyPattern('a/b/c.ts', ['dist/**', '**/*.ts'])).toBe(true);
  });

  it('returns false when no pattern matches', () => {
    expect(matchesAnyPattern('a/b/c.ts', ['dist/**', 'build/**'])).toBe(false);
  });

  it('handles empty pattern list', () => {
    expect(matchesAnyPattern('a/b/c.ts', [])).toBe(false);
  });
});

describe('shouldIgnore', () => {
  it('ignores node_modules by default', () => {
    expect(shouldIgnore('node_modules/foo/index.js')).toBe(true);
  });

  it('does not ignore src files by default', () => {
    expect(shouldIgnore('src/index.ts')).toBe(false);
  });

  it('ignores .d.ts files by default', () => {
    expect(shouldIgnore('src/types.d.ts')).toBe(true);
  });

  it('ignores min.js by default', () => {
    expect(shouldIgnore('dist/app.min.js')).toBe(true);
  });

  it('respects custom pattern list', () => {
    expect(shouldIgnore('foo.js', ['foo.js'])).toBe(true);
    expect(shouldIgnore('bar.js', ['foo.js'])).toBe(false);
  });
});

describe('isInNodeModules', () => {
  it('detects node_modules in path', () => {
    expect(isInNodeModules('node_modules/foo')).toBe(true);
    expect(isInNodeModules('a/node_modules/b')).toBe(true);
  });

  it('handles paths without node_modules', () => {
    expect(isInNodeModules('src/foo.ts')).toBe(false);
  });

  it('handles node_modules as the full path', () => {
    expect(isInNodeModules('node_modules')).toBe(true);
  });
});

describe('shouldIgnoreLine (inline ignore markers)', () => {
  it('skips lines with a generic ignore marker', () => {
    const content = 'const x = 1; // qa-agent-ignore\nconst y = 2;';
    expect(shouldIgnoreLine(content, 1)).toBe(true);
    expect(shouldIgnoreLine(content, 2)).toBe(false);
  });

  it('matches specific rule IDs', () => {
    const content = 'console.log(1); // qa-agent-ignore-line: no-console';
    expect(shouldIgnoreLine(content, 1, 'no-console')).toBe(true);
    expect(shouldIgnoreLine(content, 1, 'some-other-rule')).toBe(false);
  });

  it('returns false for out-of-range lines', () => {
    expect(shouldIgnoreLine('foo', 99)).toBe(false);
    expect(shouldIgnoreLine('foo', 0)).toBe(false);
  });
});

describe('shouldIgnoreSection', () => {
  it('returns true if any line in the range has a marker', () => {
    const content = [
      'a();',
      'b(); // qa-agent-ignore',
      'c();',
    ].join('\n');
    expect(shouldIgnoreSection(content, 1, 3)).toBe(true);
    expect(shouldIgnoreSection(content, 1, 1)).toBe(false);
  });

  it('respects rule ID filter', () => {
    const content = 'a(); // qa-agent-ignore: foo';
    expect(shouldIgnoreSection(content, 1, 1, 'foo')).toBe(true);
    expect(shouldIgnoreSection(content, 1, 1, 'bar')).toBe(false);
  });
});
