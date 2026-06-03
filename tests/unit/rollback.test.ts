/**
 * Tests for the rollback manager.
 *
 * Validates that:
 * 1. Existing files are snapshotted with their content
 * 2. New files (ENOENT) are tracked as the special sentinel
 * 3. Rollback restores existing files
 * 4. Rollback deletes files that were created after the snapshot
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RollbackManager } from '../../src/engines/fix/rollback';

let projectDir: string;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-rollback-'));
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('RollbackManager', () => {
  it('snapshots existing files and restores them', async () => {
    const file = path.join(projectDir, 'a.txt');
    await fs.writeFile(file, 'original\n', 'utf-8');

    const mgr = new RollbackManager();
    const id = await mgr.createRollbackPoint(projectDir, ['a.txt'], 'test');

    // Simulate a fix that overwrites the file
    await fs.writeFile(file, 'changed\n', 'utf-8');
    expect(await fs.readFile(file, 'utf-8')).toBe('changed\n');

    const ok = await mgr.rollback(id);
    expect(ok).toBe(true);
    expect(await fs.readFile(file, 'utf-8')).toBe('original\n');
  });

  it('deletes files that were created after the snapshot', async () => {
    const newFile = path.join(projectDir, 'new.txt');
    // File does not exist when snapshot is created
    const mgr = new RollbackManager();
    const id = await mgr.createRollbackPoint(projectDir, ['new.txt'], 'test');

    // Simulate a fix that creates the file
    await fs.writeFile(newFile, 'fresh\n', 'utf-8');
    expect((await fs.stat(newFile)).isFile()).toBe(true);

    const ok = await mgr.rollback(id);
    expect(ok).toBe(true);
    await expect(fs.stat(newFile)).rejects.toThrow();
  });

  it('listRollbackPoints returns the created point', async () => {
    await fs.writeFile(path.join(projectDir, 'x.txt'), 'hello', 'utf-8');

    const mgr = new RollbackManager();
    await mgr.createRollbackPoint(projectDir, ['x.txt'], 'test');

    const points = await mgr.listRollbackPoints(projectDir);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0].projectPath).toBe(projectDir);
    expect(points[0].files.has('x.txt')).toBe(true);
  });
});
