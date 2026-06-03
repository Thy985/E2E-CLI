/**
 * Tests for the SandboxManager
 *
 * Validates that:
 * 1. create() copies project files (excluding the configured list)
 * 2. applyFix() can replace / insert / delete content in a sandboxed file
 * 3. copyProject() respects the exclude list (no node_modules, etc.)
 * 4. destroy() cleans up the sandbox directory
 *
 * Note: server-side / Playwright methods are exercised by the e2e suite,
 * not here — they require a real dev server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SandboxManager } from '../../src/engines/sandbox';

let sourceDir: string;
let sandbox: SandboxManager;

beforeEach(async () => {
  // Build a fake "project" with a couple of source files + a noise dir
  sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-sandbox-src-'));
  await fs.writeFile(path.join(sourceDir, 'index.ts'), 'console.log("hi");', 'utf-8');
  await fs.writeFile(path.join(sourceDir, 'README.md'), '# Test', 'utf-8');
  await fs.mkdir(path.join(sourceDir, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'node_modules', 'pkg', 'index.js'), 'module', 'utf-8');

  // SandboxManager writes into cwd/.qa-agent/sandbox — switch cwd to a temp area
  process.chdir(await fs.mkdtemp(path.join(os.tmpdir(), 'qa-sandbox-cwd-')));

  sandbox = new SandboxManager();
  await sandbox.ready();
});

afterEach(async () => {
  // Best-effort: tear down any leftover sandboxes
  try { await sandbox.cleanup(); } catch { /* ignore */ }
  try { await fs.rm(sourceDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('SandboxManager', () => {
  it('copies a project while excluding heavy directories', async () => {
    const instance = await sandbox.create({ projectPath: sourceDir });
    try {
      const copied = path.join(instance.path, 'index.ts');
      const readme = path.join(instance.path, 'README.md');
      const excluded = path.join(instance.path, 'node_modules');

      expect(await fs.readFile(copied, 'utf-8')).toBe('console.log("hi");');
      expect(await fs.readFile(readme, 'utf-8')).toBe('# Test');
      await expect(fs.stat(excluded)).rejects.toThrow();
    } finally {
      await sandbox.destroy(instance.id);
    }
  });

  it('applies replace, insert, and delete changes to files', async () => {
    const instance = await sandbox.create({ projectPath: sourceDir });
    try {
      await sandbox.applyFix(instance.id, {
        id: 'fix-1',
        diagnosisId: 'd-1',
        description: 'modify index.ts',
        riskLevel: 'low',
        autoApplicable: true,
        changes: [
          { file: 'index.ts', type: 'replace', oldContent: 'console.log("hi");', content: 'console.log("bye");' },
          { file: 'extra.ts', type: 'replace', oldContent: '', content: 'new file\nline2' },
          { file: 'README.md', type: 'delete', oldContent: '# Test', content: '' },
        ],
      });

      expect(await fs.readFile(path.join(instance.path, 'index.ts'), 'utf-8')).toBe(
        'console.log("bye");'
      );
      expect(await fs.readFile(path.join(instance.path, 'extra.ts'), 'utf-8')).toBe(
        'new file\nline2'
      );
      expect(await fs.readFile(path.join(instance.path, 'README.md'), 'utf-8')).toBe('');
    } finally {
      await sandbox.destroy(instance.id);
    }
  });

  it('removes the sandbox directory on destroy', async () => {
    const instance = await sandbox.create({ projectPath: sourceDir });
    const sandboxPath = instance.path;
    await fs.stat(sandboxPath); // exists

    await sandbox.destroy(instance.id);
    await expect(fs.stat(sandboxPath)).rejects.toThrow();
  });
});
