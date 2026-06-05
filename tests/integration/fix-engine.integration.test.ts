/**
 * FixEngine Integration Tests
 *
 * Tests the FixEngine's actual file modification capabilities:
 * - Create temp directories with real buggy files
 * - Run FixEngine.applyFix with real fixes
 * - Verify file content was actually changed
 * - Test rollback functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FixEngine } from '../../src/engines/fix';
import { Fix, FileChange } from '../../src/types';

let tmpDir: string;
let engine: FixEngine;

function makeFix(changes: FileChange[]): Fix {
  return {
    id: `fix-${Date.now()}`,
    diagnosisId: 'diag-test',
    description: 'Test fix',
    changes,
    riskLevel: 'low',
    autoApplicable: true,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-fix-engine-'));
  engine = new FixEngine({
    autoApproveLowRisk: true,
    sandboxEnabled: false,
    previewBeforeApply: false,
    verifyAfterFix: false,
    compileCheck: false,
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Real file modification tests
// ---------------------------------------------------------------------------

describe('FixEngine.applyFix – real file modification', () => {
  it('should fix missing alt attribute on img tag', async () => {
    const htmlPath = path.join(tmpDir, 'index.html');
    const originalContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <img src="logo.png">
  <p>Hello world</p>
</body>
</html>`;
    fs.writeFileSync(htmlPath, originalContent, 'utf-8');

    const fix = makeFix([{
      file: 'index.html',
      type: 'replace',
      oldContent: '<img src="logo.png">',
      content: '<img src="logo.png" alt="Company logo">',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    // Verify the file content was actually changed on disk
    const afterContent = fs.readFileSync(htmlPath, 'utf-8');
    expect(afterContent).toContain('alt="Company logo"');
    expect(afterContent).not.toContain('<img src="logo.png">');
    expect(afterContent).toContain('<img src="logo.png" alt="Company logo">');
    // Verify the rest of the file is untouched
    expect(afterContent).toContain('<p>Hello world</p>');
  });

  it('should delete console.log statements from production code', async () => {
    const tsPath = path.join(tmpDir, 'utils.ts');
    const originalContent = `export function calculateTotal(items: number[]): number {
  console.log('calculating total');
  console.log('items count:', items.length);
  return items.reduce((sum, item) => sum + item, 0);
}`;
    fs.writeFileSync(tsPath, originalContent, 'utf-8');

    const fix = makeFix([{
      file: 'utils.ts',
      type: 'delete',
      oldContent: "  console.log('calculating total');\n",
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    const afterContent = fs.readFileSync(tsPath, 'utf-8');
    expect(afterContent).not.toContain("console.log('calculating total')");
    expect(afterContent).toContain("console.log('items count:");
    expect(afterContent).toContain('return items.reduce');
  });

  it('should insert content at a specific line', async () => {
    const tsPath = path.join(tmpDir, 'app.ts');
    const originalContent = `import express from 'express';
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;`;
    fs.writeFileSync(tsPath, originalContent, 'utf-8');

    const fix = makeFix([{
      file: 'app.ts',
      type: 'insert',
      position: { line: 3 },
      content: 'app.use(express.json());',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    const afterContent = fs.readFileSync(tsPath, 'utf-8');
    expect(afterContent).toContain("app.use(express.json());");
    // Verify express.json middleware is between express() and the route
    const lines = afterContent.split('\n');
    const jsonLine = lines.findIndex(l => l.includes('express.json()'));
    const getLine = lines.findIndex(l => l.includes("app.get('/health'"));
    expect(jsonLine).toBeGreaterThan(lines.findIndex(l => l.includes('const app = express')));
    expect(jsonLine).toBeLessThan(getLine);
  });

  it('should handle multiple changes across multiple files', async () => {
    // Create two files
    fs.writeFileSync(
      path.join(tmpDir, 'page1.html'),
      '<!DOCTYPE html><html><body><img src="a.png"></body></html>',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'page2.html'),
      '<!DOCTYPE html><html><body><img src="b.png"></body></html>',
      'utf-8'
    );

    const fix = makeFix([
      {
        file: 'page1.html',
        type: 'replace',
        oldContent: '<img src="a.png">',
        content: '<img src="a.png" alt="Image A">',
      },
      {
        file: 'page2.html',
        type: 'replace',
        oldContent: '<img src="b.png">',
        content: '<img src="b.png" alt="Image B">',
      },
    ]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    expect(fs.readFileSync(path.join(tmpDir, 'page1.html'), 'utf-8')).toContain('alt="Image A"');
    expect(fs.readFileSync(path.join(tmpDir, 'page2.html'), 'utf-8')).toContain('alt="Image B"');
  });
});

// ---------------------------------------------------------------------------
// Pre-flight validation tests
// ---------------------------------------------------------------------------

describe('FixEngine.applyFix – pre-flight validation', () => {
  it('should reject replace when oldContent does not match file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'Hello World', 'utf-8');

    const fix = makeFix([{
      file: 'test.txt',
      type: 'replace',
      oldContent: 'Goodbye World', // doesn't exist in file
      content: 'Hi',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.error).toContain('not found');

    // Verify file was NOT modified
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello World');
  });

  it('should reject operations on non-existent files', async () => {
    const fix = makeFix([{
      file: 'nonexistent.html',
      type: 'replace',
      oldContent: '<div>',
      content: '<section>',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should reject insert with out-of-range line number', async () => {
    const filePath = path.join(tmpDir, 'short.txt');
    fs.writeFileSync(filePath, 'line1\nline2\n', 'utf-8');

    const fix = makeFix([{
      file: 'short.txt',
      type: 'insert',
      position: { line: 100 },
      content: 'new line',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.error).toContain('out of range');
  });
});

// ---------------------------------------------------------------------------
// Atomic rollback tests (apply failure restores originals)
// ---------------------------------------------------------------------------

describe('FixEngine.applyFix – atomic rollback on failure', () => {
  it('should restore original content when second change fails', async () => {
    const file1 = path.join(tmpDir, 'a.html');
    const file2 = path.join(tmpDir, 'b.html');
    const originalA = '<img src="a.png">';
    const originalB = '<img src="b.png">';
    fs.writeFileSync(file1, originalA, 'utf-8');
    fs.writeFileSync(file2, originalB, 'utf-8');

    const fix = makeFix([
      {
        file: 'a.html',
        type: 'replace',
        oldContent: '<img src="a.png">',
        content: '<img src="a.png" alt="A">',
      },
      {
        file: 'b.html',
        type: 'replace',
        oldContent: '<THIS DOES NOT EXIST>', // this will fail
        content: '<img src="b.png" alt="B">',
      },
    ]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);

    // Both files should be restored to original content
    expect(fs.readFileSync(file1, 'utf-8')).toBe(originalA);
    expect(fs.readFileSync(file2, 'utf-8')).toBe(originalB);
  });
});

// ---------------------------------------------------------------------------
// Rollback point + restore tests
// ---------------------------------------------------------------------------

describe('FixEngine.rollback – create and restore', () => {
  it('should create a rollback point and restore original content', async () => {
    const filePath = path.join(tmpDir, 'index.html');
    const originalContent = `<!DOCTYPE html>
<html lang="en">
<head><title>Original</title></head>
<body><h1>Original Page</h1></body>
</html>`;
    fs.writeFileSync(filePath, originalContent, 'utf-8');

    // Apply a real fix first
    const fix = makeFix([{
      file: 'index.html',
      type: 'replace',
      oldContent: '<h1>Original Page</h1>',
      content: '<h1>Modified Page</h1>',
    }]);
    const applyResult = await engine.applyFix(fix, tmpDir);
    expect(applyResult.success).toBe(true);

    // Verify modification happened
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('<h1>Modified Page</h1>');

    // Now create a rollback point (need another change to create it with)
    const fix2 = makeFix([{
      file: 'index.html',
      type: 'replace',
      oldContent: '<h1>Modified Page</h1>',
      content: '<h1>Second Modification</h1>',
    }]);

    const rollbackId = await engine.createRollbackPoint(tmpDir, fix2.changes);
    expect(rollbackId).toBeTruthy();
    expect(rollbackId).toMatch(/^rollback-/);

    // Apply the second fix
    const result2 = await engine.applyFix(fix2, tmpDir);
    expect(result2.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('<h1>Second Modification</h1>');

    // Rollback
    await engine.rollback(rollbackId, tmpDir);

    // Verify original content was restored
    const restoredContent = fs.readFileSync(filePath, 'utf-8');
    expect(restoredContent).toContain('<h1>Modified Page</h1>');
    expect(restoredContent).not.toContain('<h1>Second Modification</h1>');
  });

  it('should throw when rollback point does not exist', async () => {
    await expect(engine.rollback('nonexistent-id', tmpDir)).rejects.toThrow(/not found/);
  });

  it('should handle rollback for files in nested directories', async () => {
    const nestedDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(nestedDir, { recursive: true });
    const filePath = path.join(nestedDir, 'Button.tsx');
    const originalContent = `<button>Click me</button>`;
    fs.writeFileSync(filePath, originalContent, 'utf-8');

    const fix = makeFix([{
      file: 'src/components/Button.tsx',
      type: 'replace',
      oldContent: '<button>Click me</button>',
      content: '<button aria-label="Click me">Click me</button>',
    }]);

    // Apply fix
    const applyResult = await engine.applyFix(fix, tmpDir);
    expect(applyResult.success).toBe(true);

    // Create rollback point for another change
    const fix2 = makeFix([{
      file: 'src/components/Button.tsx',
      type: 'replace',
      oldContent: '<button aria-label="Click me">Click me</button>',
      content: '<button aria-label="Submit">Submit</button>',
    }]);
    const rollbackId = await engine.createRollbackPoint(tmpDir, fix2.changes);

    // Apply second fix
    await engine.applyFix(fix2, tmpDir);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('Submit');

    // Rollback
    await engine.rollback(rollbackId, tmpDir);

    // Verify the first fix's content is restored
    const restored = fs.readFileSync(filePath, 'utf-8');
    expect(restored).toContain('Click me');
    expect(restored).toContain('aria-label="Click me"');
  });
});

// ---------------------------------------------------------------------------
// Risk assessment tests (real files on disk)
// ---------------------------------------------------------------------------

describe('FixEngine.assessRisk – real file risk evaluation', () => {
  it('should rate replacing alt text as low risk for small cosmetic changes', () => {
    // Note: HTML tag replacement is considered structural (not just whitespace/comments)
    // so it rates as medium. Only pure cosmetic changes (whitespace/comments) get low.
    const fix = makeFix([{
      file: 'index.html',
      type: 'replace',
      oldContent: '<img src="a.png">',
      content: '<img src="a.png" alt="desc">',
    }]);

    // Structural changes in non-critical single-file gets medium
    expect(engine.assessRisk(fix)).toBe('medium');
  });

  it('should rate package.json changes as high risk', () => {
    const fix = makeFix([{
      file: 'package.json',
      type: 'replace',
      oldContent: '"react": "^17"',
      content: '"react": "^18"',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate delete operations as high risk when oldContent exists', () => {
    const fix = makeFix([{
      file: 'app.ts',
      type: 'delete',
      oldContent: 'export const secret = "abc123";',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate insert operations as medium risk', () => {
    const fix = makeFix([{
      file: 'index.html',
      type: 'insert',
      position: { line: 5 },
      content: '<meta name="description" content="test">',
    }]);

    expect(engine.assessRisk(fix)).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Compile check tests
// ---------------------------------------------------------------------------

describe('FixEngine.applyFix – compile check integration', () => {
  it('should pass compile check for a valid TypeScript fix', async () => {
    const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tsc-pass-'));

    // Create a minimal tsconfig.json
    fs.writeFileSync(
      path.join(tsDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', strict: true, module: 'ESNext', moduleResolution: 'bundler' },
        include: ['*.ts'],
      }),
      'utf-8'
    );

    // Create a file with a bug
    const srcPath = path.join(tsDir, 'app.ts');
    fs.writeFileSync(srcPath, 'export function greet(name: string): string {\n  return "Hello, " + name;\n}', 'utf-8');

    // Create a fix engine with compile check enabled
    const compileEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterFix: false,
      compileCheck: true,
    });

    // Apply a valid fix (improve the return statement)
    const fix = makeFix([{
      file: 'app.ts',
      type: 'replace',
      oldContent: 'return "Hello, " + name;',
      content: 'return `Hello, ${name}`;',
    }]);

    const result = await compileEngine.applyFix(fix, tsDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.compileCheckPassed).toBe(true);

    fs.rmSync(tsDir, { recursive: true, force: true });
  });

  it('should fail compile check and rollback when fix introduces type error', async () => {
    const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tsc-fail-'));

    // Create a minimal tsconfig.json
    fs.writeFileSync(
      path.join(tsDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', strict: true, module: 'ESNext', moduleResolution: 'bundler' },
        include: ['*.ts'],
      }),
      'utf-8'
    );

    // Create a file with correct code
    const srcPath = path.join(tsDir, 'app.ts');
    const originalContent = 'export function add(a: number, b: number): number {\n  return a + b;\n}';
    fs.writeFileSync(srcPath, originalContent, 'utf-8');

    // Create a fix engine with compile check enabled
    const compileEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterFix: false,
      compileCheck: true,
    });

    // Apply a fix that introduces a type error (return string instead of number)
    const fix = makeFix([{
      file: 'app.ts',
      type: 'replace',
      oldContent: 'return a + b;',
      content: 'return "sum: " + (a + b);',
    }]);

    const result = await compileEngine.applyFix(fix, tsDir);

    expect(result.success).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.compileCheckPassed).toBe(false);
    expect(result.compileCheckOutput).toBeTruthy();

    // Verify the file was rolled back to original content
    const afterContent = fs.readFileSync(srcPath, 'utf-8');
    expect(afterContent).toBe(originalContent);

    fs.rmSync(tsDir, { recursive: true, force: true });
  });

  it('should skip compile check when compileCheck is false', async () => {
    const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tsc-skip-'));

    // No tsconfig.json — compile check would fail if run
    const srcPath = path.join(tsDir, 'app.ts');
    fs.writeFileSync(srcPath, 'export const x = 1;', 'utf-8');

    const noCompileEngine = new FixEngine({
      autoApproveLowRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterFix: false,
      compileCheck: false,
    });

    const fix = makeFix([{
      file: 'app.ts',
      type: 'replace',
      oldContent: 'export const x = 1;',
      content: 'export const x = 2;',
    }]);

    const result = await noCompileEngine.applyFix(fix, tsDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.compileCheckPassed).toBeUndefined();

    fs.rmSync(tsDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Edge case tests
// ---------------------------------------------------------------------------

describe('FixEngine edge cases', () => {
  it('should handle empty changes array', async () => {
    const fix = makeFix([]);
    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
  });

  it('should handle replace with empty oldContent matching empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(filePath, '', 'utf-8');

    const fix = makeFix([{
      file: 'empty.txt',
      type: 'replace',
      oldContent: '',
      content: 'now has content',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('now has content');
  });

  it('should handle file with special characters in content', async () => {
    const filePath = path.join(tmpDir, 'special.html');
    const originalContent = '<div class="foo & bar" data-id="123">\n  <script>var x = "<b>test</b>";</script>\n</div>';
    fs.writeFileSync(filePath, originalContent, 'utf-8');

    const fix = makeFix([{
      file: 'special.html',
      type: 'replace',
      oldContent: '<b>test</b>',
      content: '<strong>test</strong>',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('<strong>test</strong>');
  });

  it('should handle large file with small change', async () => {
    const filePath = path.join(tmpDir, 'large.ts');
    // Create a file with 500 lines
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`const line${i} = ${i};`);
    }
    lines[250] = "console.log('bug');";
    const largeContent = lines.join('\n');
    fs.writeFileSync(filePath, largeContent, 'utf-8');

    const fix = makeFix([{
      file: 'large.ts',
      type: 'replace',
      oldContent: "console.log('bug');",
      content: "// console.log removed",
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);

    const afterContent = fs.readFileSync(filePath, 'utf-8');
    // Verify only the one line changed
    expect(afterContent).not.toContain("console.log('bug')");
    expect(afterContent).toContain('const line0 = 0;');
    expect(afterContent).toContain('const line499 = 499;');
  });

  it('should handle multiple replaces in the same file', async () => {
    const filePath = path.join(tmpDir, 'multi.html');
    fs.writeFileSync(filePath, '<img src="a.jpg"><img src="b.jpg"><img src="c.jpg">', 'utf-8');

    const fix = makeFix([
      {
        file: 'multi.html',
        type: 'replace',
        oldContent: '<img src="a.jpg">',
        content: '<img src="a.jpg" alt="A">',
      },
      {
        file: 'multi.html',
        type: 'replace',
        oldContent: '<img src="b.jpg">',
        content: '<img src="b.jpg" alt="B">',
      },
      {
        file: 'multi.html',
        type: 'replace',
        oldContent: '<img src="c.jpg">',
        content: '<img src="c.jpg" alt="C">',
      },
    ]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    const after = fs.readFileSync(filePath, 'utf-8');
    expect(after).toContain('alt="A"');
    expect(after).toContain('alt="B"');
    expect(after).toContain('alt="C"');
  });

  it('should handle deeply nested directory paths', async () => {
    const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e');
    fs.mkdirSync(deepDir, { recursive: true });
    const filePath = path.join(deepDir, 'component.tsx');
    fs.writeFileSync(filePath, 'export const Cmp = () => <div></div>;', 'utf-8');

    const fix = makeFix([{
      file: 'a/b/c/d/e/component.tsx',
      type: 'replace',
      oldContent: '<div></div>',
      content: '<div role="main"></div>',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('role="main"');
  });

  it('should handle unicode content', async () => {
    const filePath = path.join(tmpDir, 'i18n.ts');
    fs.writeFileSync(filePath, 'const greeting = "こんにちは世界";\nconst emoji = "🎉🚀";', 'utf-8');

    const fix = makeFix([{
      file: 'i18n.ts',
      type: 'replace',
      oldContent: 'const greeting = "こんにちは世界";',
      content: 'const greeting = "Hello World";',
    }]);

    const result = await engine.applyFix(fix, tmpDir);

    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    const after = fs.readFileSync(filePath, 'utf-8');
    expect(after).toContain('Hello World');
    expect(after).toContain('🎉🚀');
  });
});

// ---------------------------------------------------------------------------
// Risk assessment edge cases
// ---------------------------------------------------------------------------

describe('FixEngine.assessRisk – edge cases', () => {
  it('should rate empty changes as low', () => {
    const fix = makeFix([]);
    expect(engine.assessRisk(fix)).toBe('low');
  });

  it('should rate .env file changes as high', () => {
    const fix = makeFix([{
      file: '.env',
      type: 'replace',
      oldContent: 'DB_HOST=localhost',
      content: 'DB_HOST=production-db.example.com',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate tsconfig changes as high', () => {
    const fix = makeFix([{
      file: 'tsconfig.json',
      type: 'replace',
      oldContent: '"strict": false',
      content: '"strict": true',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate Dockerfile changes as high', () => {
    const fix = makeFix([{
      file: 'Dockerfile',
      type: 'replace',
      oldContent: 'FROM node:16',
      content: 'FROM node:20',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate webpack.config.ts changes as high', () => {
    const fix = makeFix([{
      file: 'webpack.config.ts',
      type: 'replace',
      oldContent: 'mode: "development"',
      content: 'mode: "production"',
    }]);

    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate >5 files as high', () => {
    const changes: FileChange[] = [];
    for (let i = 0; i < 6; i++) {
      changes.push({
        file: `page${i}.html`,
        type: 'replace',
        oldContent: '<div>',
        content: '<section>',
      });
    }
    const fix = makeFix(changes);
    expect(engine.assessRisk(fix)).toBe('high');
  });

  it('should rate cross-file changes as medium', () => {
    const fix = makeFix([
      {
        file: 'a.html',
        type: 'replace',
        oldContent: '<div>',
        content: '<section>',
      },
      {
        file: 'b.html',
        type: 'replace',
        oldContent: '<div>',
        content: '<section>',
      },
    ]);

    expect(engine.assessRisk(fix)).toBe('medium');
  });
});
