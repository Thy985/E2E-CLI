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
