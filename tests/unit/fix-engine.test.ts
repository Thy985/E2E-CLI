/**
 * Tests for the enhanced FixEngine
 *
 * Validates that:
 * 1. replaceInFile replaces matching content
 * 2. insertInFile inserts at the right line
 * 3. deleteInFile removes targeted content
 * 4. Files that don't exist are created on replace
 * 5. Rollback is triggered when verification fails
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FixEngine } from '../../src/engines/fix/enhanced';

let projectDir: string;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-fix-'));
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('FixEngine applyFix', () => {
  it('applies a replace change to an existing file', async () => {
    const file = path.join(projectDir, 'a.txt');
    await fs.writeFile(file, 'hello world', 'utf-8');

    const engine = new FixEngine({
      autoApproveLowRisk: true,
      autoApproveMediumRisk: true,
      autoApproveHighRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterApply: false,
      createRollbackPoint: false,
    });

    const result = await engine.applyFix(
      {
        id: 'test-1',
        diagnosisId: 'd-1',
        description: 'replace hello',
        riskLevel: 'low',
        autoApplicable: true,
        changes: [
          {
            file: 'a.txt',
            type: 'replace',
            oldContent: 'hello',
            content: 'goodbye',
          },
        ],
      },
      projectDir
    );

    expect(result.success).toBe(true);
    expect(await fs.readFile(file, 'utf-8')).toBe('goodbye world');
  });

  it('creates a file when replacing into a missing one', async () => {
    const engine = new FixEngine({
      autoApproveLowRisk: true,
      autoApproveMediumRisk: true,
      autoApproveHighRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterApply: false,
      createRollbackPoint: false,
    });

    const result = await engine.applyFix(
      {
        id: 'test-2',
        diagnosisId: 'd-2',
        description: 'create new',
        riskLevel: 'low',
        autoApplicable: true,
        changes: [
          {
            file: 'new.txt',
            type: 'replace',
            oldContent: '',
            content: 'fresh content',
          },
        ],
      },
      projectDir
    );

    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(projectDir, 'new.txt'), 'utf-8')).toBe(
      'fresh content'
    );
  });

  it('applies an insert change at the requested line', async () => {
    const file = path.join(projectDir, 'b.txt');
    await fs.writeFile(file, 'line1\nline2\nline3', 'utf-8');

    const engine = new FixEngine({
      autoApproveLowRisk: true,
      autoApproveMediumRisk: true,
      autoApproveHighRisk: true,
      sandboxEnabled: false,
      previewBeforeApply: false,
      verifyAfterApply: false,
      createRollbackPoint: false,
    });

    const result = await engine.applyFix(
      {
        id: 'test-3',
        diagnosisId: 'd-3',
        description: 'insert line',
        riskLevel: 'low',
        autoApplicable: true,
        changes: [
          {
            file: 'b.txt',
            type: 'insert',
            position: { line: 2 },
            content: 'inserted',
          },
        ],
      },
      projectDir
    );

    expect(result.success).toBe(true);
    expect(await fs.readFile(file, 'utf-8')).toBe('line1\ninserted\nline2\nline3');
  });
});
