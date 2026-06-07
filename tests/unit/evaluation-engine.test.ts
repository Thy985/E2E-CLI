/**
 * Evaluation Engine Tests
 *
 * Tests for evaluateDiagnosis, evaluateFix, applyChanges, and the shared evaluation utilities.
 */

import { describe, it, expect } from 'bun:test';
import type { GoldenTestCase } from '../../src/engines/harness/types';
import {
  evaluateDiagnosis,
  evaluateFix,
  applyChanges,
  createVirtualFS,
  createSilentLogger,
  buildSkillContext,
  collectNodeSignatures,
  collectNodeTypes,
} from '../../src/engines/harness/evaluation-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCase(
  id: string,
  code: string,
  filePath: string,
  expectedIssueCount: number,
  expectedIssueTypes: string[],
  fixPattern?: string,
  shouldNotExist?: string[],
  expectedLines?: Array<{ ruleId: string; line: number }>,
): GoldenTestCase {
  return {
    id,
    skill: 'a11y',
    input: { code, filePath, tags: [] },
    expectedDiagnosis: {
      issueCount: expectedIssueCount,
      issueTypes: expectedIssueTypes,
      expectedLineRanges: expectedLines,
    },
    expectedFix: {
      codePattern: fixPattern ?? null,
      shouldNotExist,
    },
    difficulty: 'easy',
  };
}

// ---------------------------------------------------------------------------
// evaluateDiagnosis tests
// ---------------------------------------------------------------------------

describe('evaluateDiagnosis', () => {
  it('returns perfect metrics when diagnosis matches exactly', () => {
    const testCase = makeCase('test-001', '<img src="x">', 'test.html', 1, ['img-alt']);
    const result = evaluateDiagnosis(testCase, [
      { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html' } },
    ]);

    expect(result.truePositives).toBe(1);
    expect(result.falsePositives).toBe(0);
    expect(result.falseNegatives).toBe(0);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  it('detects false negatives when expected issues are not found', () => {
    const testCase = makeCase('test-002', '<img src="x">', 'test.html', 2, ['img-alt', 'label']);
    const result = evaluateDiagnosis(testCase, [
      { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html' } },
    ]);

    expect(result.falseNegatives).toBe(1); // 'label' not found
    expect(result.recall).toBeLessThan(1);
  });

  it('detects false positives when unexpected issues are found', () => {
    const testCase = makeCase('test-003', '<img src="x">', 'test.html', 1, ['img-alt']);
    const result = evaluateDiagnosis(testCase, [
      { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html' } },
      { id: 'd2', severity: 'info', title: '', description: '', ruleId: 'extra-rule', metadata: { ruleId: 'extra-rule' }, location: { file: 'test.html' } },
    ]);

    expect(result.falsePositives).toBe(1);
    expect(result.precision).toBeLessThan(1);
  });

  it('respects falsePositives whitelist', () => {
    const testCase = makeCase('test-004', '<img src="x">', 'test.html', 1, ['img-alt']);
    testCase.expectedDiagnosis.falsePositives = ['extra-rule'];

    const result = evaluateDiagnosis(testCase, [
      { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html' } },
      { id: 'd2', severity: 'info', title: '', description: '', ruleId: 'extra-rule', metadata: { ruleId: 'extra-rule' }, location: { file: 'test.html' } },
    ]);

    // extra-rule is in falsePositives, so it should NOT count as a new FP
    // But it IS defined in falsePositives, so it counts as fpFromDefined
    expect(result.falsePositives).toBe(1); // 1 from falsePositives
  });

  it('handles empty diagnosis (all missed)', () => {
    const testCase = makeCase('test-005', '<img src="x">', 'test.html', 1, ['img-alt']);
    const result = evaluateDiagnosis(testCase, []);

    expect(result.truePositives).toBe(0);
    expect(result.falseNegatives).toBe(1);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('counts multiple instances of same type', () => {
    const testCase = makeCase('test-006', '<img src="x">', 'test.html', 3, ['img-alt']);
    // Expect 3 instances of img-alt
    const result = evaluateDiagnosis(testCase, [
      { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 1 } },
      { id: 'd2', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 2 } },
      { id: 'd3', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 3 } },
    ]);

    expect(result.truePositives).toBeGreaterThanOrEqual(2); // capped at instancesPerType
  });

  describe('with expectedLineRanges (position precision)', () => {
    it('matches by ruleId + line within tolerance', () => {
      const testCase = makeCase(
        'test-pos-001',
        'line1\nline2\n<img src="x">\nline4',
        'test.html',
        1,
        ['img-alt'],
        undefined,
        undefined,
        [{ ruleId: 'img-alt', line: 3 }],
      );

      const result = evaluateDiagnosis(testCase, [
        { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 3 } },
      ]);

      expect(result.truePositives).toBe(1);
    });

    it('counts as miss when line is outside tolerance', () => {
      const testCase = makeCase(
        'test-pos-002',
        'line1\nline2\n<img src="x">\nline4',
        'test.html',
        1,
        ['img-alt'],
        undefined,
        undefined,
        [{ ruleId: 'img-alt', line: 3 }],
      );

      const result = evaluateDiagnosis(testCase, [
        { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 10 } },
      ]);

      // Line 10 is outside ±1 tolerance of line 3
      expect(result.falseNegatives).toBeGreaterThanOrEqual(1);
    });

    it('matches within ±1 line tolerance', () => {
      const testCase = makeCase(
        'test-pos-003',
        '<img src="x">',
        'test.html',
        1,
        ['img-alt'],
        undefined,
        undefined,
        [{ ruleId: 'img-alt', line: 1 }],
      );

      const result = evaluateDiagnosis(testCase, [
        { id: 'd1', severity: 'warning', title: '', description: '', ruleId: 'img-alt', metadata: { ruleId: 'img-alt' }, location: { file: 'test.html', line: 2 } },
      ]);

      expect(result.truePositives).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateFix tests
// ---------------------------------------------------------------------------

describe('evaluateFix', () => {
  it('returns zero metrics when no fix is provided', () => {
    const testCase = makeCase('fix-001', '<img src="x">', 'test.html', 1, ['img-alt'], 'alt="', ['<img src="x">']);
    const result = evaluateFix(testCase, null);

    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('detects successful fix when pattern is present', () => {
    const testCase = makeCase('fix-002', '<img src="x">', 'test.html', 1, ['img-alt'], 'alt="');
    const result = evaluateFix(testCase, '<img src="x" alt="description">');

    expect(result.recall).toBe(1);
  });

  it('detects successful removal of shouldNotExist patterns', () => {
    const testCase = makeCase('fix-003', 'console.log("debug")', 'test.js', 0, [], 'process.env', ['console.log("debug")']);
    const result = evaluateFix(testCase, 'if (process.env.NODE_ENV !== "production") {}');

    // console.log removed → precision = 1
    expect(result.precision).toBe(1);
  });

  it('detects partial fix (pattern added but shouldNotExist still present)', () => {
    const testCase = makeCase('fix-004', 'console.log("debug")', 'test.js', 0, [], 'process.env', ['console.log("debug")']);
    const result = evaluateFix(testCase, 'if (process.env.NODE_ENV !== "production") { console.log("debug") }');

    // console.log still present → precision = 0
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(1); // process.env is present
  });

  it('handles shouldNotExist with multiple patterns', () => {
    const testCase = makeCase('fix-005', 'eval(x); alert(y)', 'test.js', 0, [], '', ['eval(', 'alert(']);
    // safeEval(x) does NOT contain 'eval(' substring (case-sensitive)
    // alert( is removed, but eval( is a substring of 'eval(x); safeEval(x)' → 'eval(' IS in 'eval(x)'
    const result = evaluateFix(testCase, 'eval(x); safeEval(x)');

    // eval( still present → precision < 1
    expect(result.precision).toBeLessThan(1);
  });

  it('returns perfect precision when no shouldNotExist constraints', () => {
    const testCase = makeCase('fix-006', 'old code', 'test.js', 0, [], 'new code');
    const result = evaluateFix(testCase, 'some new code here');

    expect(result.precision).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// applyChanges tests
// ---------------------------------------------------------------------------

describe('applyChanges', () => {
  it('replaces old content with new content', () => {
    const original = 'const x = 1;\nconst y = 2;';
    const changes = [{ type: 'replace' as const, oldContent: 'const y = 2;', content: 'const y = 3;' }];

    const result = applyChanges(original, changes);
    expect(result).toBe('const x = 1;\nconst y = 3;');
  });

  it('inserts content at a specific line', () => {
    const original = 'line1\nline3';
    const changes = [{ type: 'insert' as const, content: 'line2', position: { line: 2, character: 0 } }];

    const result = applyChanges(original, changes);
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('line3');
  });

  it('deletes content by oldContent', () => {
    const original = 'line1\ndelete_me\nline3';
    const changes = [{ type: 'delete' as const, oldContent: 'delete_me' }];

    const result = applyChanges(original, changes);
    expect(result).toBe('line1\n\nline3');
  });

  it('applies multiple changes in sequence', () => {
    const original = 'a\nb\nc';
    const changes = [
      { type: 'replace' as const, oldContent: 'a', content: 'A' },
      { type: 'replace' as const, oldContent: 'c', content: 'C' },
    ];

    const result = applyChanges(original, changes);
    expect(result).toBe('A\nb\nC');
  });

  it('returns original when no changes', () => {
    const original = 'unchanged';
    const result = applyChanges(original, []);
    expect(result).toBe('unchanged');
  });
});

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------

describe('createVirtualFS', () => {
  it('reads file content correctly', async () => {
    const fs = createVirtualFS('src/index.ts', 'const x = 1;');
    const content = await fs.readFile('src/index.ts');
    expect(content).toBe('const x = 1;');
  });

  it('throws on non-existent file', async () => {
    const fs = createVirtualFS('src/index.ts', 'const x = 1;');
    await expect(fs.readFile('src/other.ts')).rejects.toThrow('File not found');
  });

  it('exists returns true for virtual file', async () => {
    const fs = createVirtualFS('src/index.ts', 'const x = 1;');
    expect(await fs.exists('src/index.ts')).toBe(true);
    expect(await fs.exists('src/other.ts')).toBe(false);
  });

  it('glob matches by extension', async () => {
    const fs = createVirtualFS('src/index.ts', 'const x = 1;');
    const files = await fs.glob('**/*.ts');
    expect(files).toContain('src/index.ts');
  });

  it('glob returns empty for non-matching pattern', async () => {
    const fs = createVirtualFS('src/index.ts', 'const x = 1;');
    const files = await fs.glob('**/*.js');
    expect(files).toEqual([]);
  });

  it('glob handles brace expansion', async () => {
    const fs = createVirtualFS('src/App.tsx', 'export default function App() {}');
    const files = await fs.glob('**/*.{ts,tsx}');
    expect(files).toContain('src/App.tsx');
  });
});

describe('createSilentLogger', () => {
  it('returns a logger with all required methods', () => {
    const logger = createSilentLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('does not throw when called', () => {
    const logger = createSilentLogger();
    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
  });
});

describe('buildSkillContext', () => {
  it('returns a valid SkillContext', () => {
    const testCase = makeCase('ctx-001', 'const x = 1;', 'test.ts', 0, []);
    const ctx = buildSkillContext(testCase);

    expect(ctx.project.name).toBe('golden-ctx-001');
    expect(ctx.tools).toBeDefined();
    expect(ctx.model.isMock).toBe(true);
  });

  it('provides virtual FS with correct content', async () => {
    const testCase = makeCase('ctx-002', 'const y = 2;', 'test.ts', 0, []);
    const ctx = buildSkillContext(testCase);

    const content = await ctx.tools.fs.readFile('test.ts');
    expect(content).toBe('const y = 2;');
  });
});

describe('AST helpers', () => {
  describe('collectNodeSignatures', () => {
    it('extracts type:path signatures from AST nodes', () => {
      const node = { type: 'Identifier', name: 'x' };
      const sigs = collectNodeSignatures(node);
      expect(sigs).toContain('Identifier:root');
    });

    it('handles nested objects', () => {
      const node = {
        type: 'Program',
        body: [
          { type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'x' } },
        ],
      };
      const sigs = collectNodeSignatures(node);
      expect(sigs).toContain('Program:root');
      expect(sigs).toContain('ExpressionStatement:root.body[0]');
      expect(sigs).toContain('Identifier:root.body[0].expression');
    });

    it('handles arrays', () => {
      const arr = [
        { type: 'Literal', value: 1 },
        { type: 'Literal', value: 2 },
      ];
      const sigs = collectNodeSignatures(arr);
      expect(sigs).toContain('Literal:root[0]');
      expect(sigs).toContain('Literal:root[1]');
    });

    it('skips non-object primitives', () => {
      expect(collectNodeSignatures(null as any)).toEqual([]);
      expect(collectNodeSignatures(undefined as any)).toEqual([]);
      expect(collectNodeSignatures(42 as any)).toEqual([]);
      expect(collectNodeSignatures('test' as any)).toEqual([]);
    });
  });

  describe('collectNodeTypes', () => {
    it('extracts just type names without paths', () => {
      const node = { type: 'Program', body: [{ type: 'ExpressionStatement' }] };
      const types = collectNodeTypes(node);
      expect(types).toContain('Program');
      expect(types).toContain('ExpressionStatement');
    });

    it('handles nested structures', () => {
      const node = {
        type: 'FunctionDeclaration',
        params: [{ type: 'Identifier', name: 'x' }],
        body: { type: 'BlockStatement' },
      };
      const types = collectNodeTypes(node);
      expect(types).toContain('FunctionDeclaration');
      expect(types).toContain('Identifier');
      expect(types).toContain('BlockStatement');
    });
  });
});
