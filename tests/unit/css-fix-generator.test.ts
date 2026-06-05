import { describe, expect, it } from 'bun:test';
import { CSSFixGenerator } from '../../src/skills/builtin/uiux/fixers/css-fix-generator';
import { Diagnosis } from '../../src/types';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

async function withTempFile<T>(content: string, fn: (filePath: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'css-fix-test-'));
  const filePath = path.join(dir, 'style.css');
  await fsp.writeFile(filePath, content, 'utf-8');
  try {
    return await fn(filePath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 'test-1',
    skill: 'uiux',
    type: 'ui-ux',
    severity: 'warning',
    title: 'test',
    description: 'test',
    location: { file: 'style.css', line: 1, column: 1 },
    ...overrides,
  };
}

describe('CSSFixGenerator - 4x stateFix Map dispatch', () => {
  const cssBlock = `.button {\n  color: red;\n  padding: 8px;\n}`;
  const gen = new CSSFixGenerator();

  it('generates :hover state fix via Map dispatch', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: {
          type: 'missing-hover-state',
          element: 'button',
          suggestion: 'background: blue;',
        },
        location: { file: 'style.css', line: 1, column: 1 },
      });

      const fix = await gen.generateInteractionFix(diagnosis, path.dirname(filePath));

      expect(fix.riskLevel).toBe('low');
      expect(fix.changes[0].type).toBe('insert');
      expect(fix.changes[0].content).toContain('&:hover');
      expect(fix.changes[0].content).toContain('background: blue;');
    });
  });

  it('generates :focus state fix', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: { type: 'missing-focus-state', element: 'input', suggestion: 'outline: 2px;' },
        location: { file: 'style.css', line: 1, column: 1 },
      });
      const fix = await gen.generateInteractionFix(diagnosis, path.dirname(filePath));
      expect(fix.changes[0].content).toContain('&:focus');
      expect(fix.changes[0].content).toContain('outline: 2px;');
    });
  });

  it('generates :active state fix', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: { type: 'missing-active-state', element: 'a', suggestion: 'opacity: 0.7;' },
        location: { file: 'style.css', line: 1, column: 1 },
      });
      const fix = await gen.generateInteractionFix(diagnosis, path.dirname(filePath));
      expect(fix.changes[0].content).toContain('&:active');
    });
  });

  it('generates :disabled state fix', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: { type: 'missing-disabled-state', element: 'btn', suggestion: 'cursor: not-allowed;' },
        location: { file: 'style.css', line: 1, column: 1 },
      });
      const fix = await gen.generateInteractionFix(diagnosis, path.dirname(filePath));
      expect(fix.changes[0].content).toContain('&:disabled');
      expect(fix.changes[0].content).toContain('cursor: not-allowed;');
    });
  });

  it('rejects unknown state fix type', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: { type: 'missing-target-state', element: 'btn', suggestion: 'x' },
        location: { file: 'style.css', line: 1, column: 1 },
      });
      await expect(
        gen.generateInteractionFix(diagnosis, path.dirname(filePath))
      ).rejects.toThrow(/missing-target-state/);
    });
  });

  it('rejects missing type metadata', async () => {
    await withTempFile(cssBlock, async (filePath) => {
      const diagnosis = makeDiagnosis({
        metadata: { element: 'btn' },
        location: { file: 'style.css', line: 1, column: 1 },
      });
      await expect(
        gen.generateInteractionFix(diagnosis, path.dirname(filePath))
      ).rejects.toThrow();
    });
  });
});

describe('CSSFixGenerator - visual fix (color/spacing/radius)', () => {
  const gen = new CSSFixGenerator();

  it('generates color mismatch fix', async () => {
    const diagnosis = makeDiagnosis({
      metadata: { type: 'color-mismatch', current: '#ff0000', suggestion: 'var(--color-primary)' },
      location: { file: 'styles.css', line: 5, column: 1 },
    });
    const fix = await gen.generateVisualFix(diagnosis, '/tmp');
    expect(fix.changes[0].type).toBe('replace');
    expect(fix.changes[0].oldContent).toBe('#ff0000');
    expect(fix.changes[0].content).toBe('var(--color-primary)');
    expect(fix.description).toContain('var(--color-primary)');
  });

  it('generates spacing fix', async () => {
    const diagnosis = makeDiagnosis({
      metadata: { type: 'spacing-inconsistent', current: '13px', suggestion: '16px' },
      location: { file: 'styles.css', line: 7, column: 1 },
    });
    const fix = await gen.generateVisualFix(diagnosis, '/tmp');
    expect(fix.description).toContain('16px');
  });

  it('generates border-radius fix', async () => {
    const diagnosis = makeDiagnosis({
      metadata: { type: 'border-radius-mismatch', current: '3px', suggestion: '6px' },
      location: { file: 'styles.css', line: 8, column: 1 },
    });
    const fix = await gen.generateVisualFix(diagnosis, '/tmp');
    expect(fix.description).toContain('6px');
  });

  it('rejects unknown visual fix type', async () => {
    const diagnosis = makeDiagnosis({
      metadata: { type: 'unknown-type', current: 'x', suggestion: 'y' },
      location: { file: 'styles.css', line: 1, column: 1 },
    });
    await expect(gen.generateVisualFix(diagnosis, '/tmp')).rejects.toThrow(/unknown-type/);
  });
});
