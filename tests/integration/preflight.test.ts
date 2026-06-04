/**
 * Integration tests for scripts/preflight.sh.
 *
 * We exercise the script from a real shell so the bash + python3 dance is
 * actually validated. Each test creates a fresh tmp project containing just
 * enough scaffolding to make preflight reach a decision, then:
 *   - asserts the exit code
 *   - asserts the JSON report shape (when --format=json)
 *   - asserts the text report contains the expected decision marker
 *
 * Tmp project layout:
 *   <tmp>/
 *     .trae/memory.json
 *     .trae/adr/<adrs...>.md
 *     src/<optional: triggers drift signals>
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const PREFLIGHT = path.resolve(__dirname, '../../scripts/preflight.sh');

async function runPreflight(cwd: string, args: string[] = []): Promise<{ exit: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ['bash', PREFLIGHT, ...args],
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  return { exit, stdout, stderr };
}

async function writeAdr(dir: string, id: string, status: 'accepted' | 'proposed' = 'accepted'): Promise<void> {
  const body = [
    '---',
    `id: ${id}`,
    'title: "test"',
    `status: ${status}`,
    'date: 2026-06-04',
    '---',
    '',
    'body',
    '',
  ].join('\n');
  await fs.writeFile(path.join(dir, `${id}-test.md`), body);
}

async function writeMemory(dir: string, overrides: Record<string, any> = {}): Promise<void> {
  const memory = {
    $schema: './memory.schema.json',
    version: '1.0',
    last_updated: '2026-06-04',
    last_updated_by: 'test',
    decisions: {},
    core_modules: {},
    metrics: { test_count: 0, test_files: 0, test_status: '', typecheck: '0 errors', src_files: 0, lines_of_code_approx: 0 },
    verification: {
      last_verified_at: '2026-06-04',
      verifier: 'test',
      next_verification_due: '2026-07-04',
      known_issues: [],
    },
    adrs: [],
    ...overrides,
  };
  await fs.writeFile(path.join(dir, '.trae/memory.json'), JSON.stringify(memory, null, 2));
}

async function makeFixture(opts: { memoryOverrides?: any; adrs?: Array<{ id: string; status?: 'accepted' | 'proposed' }>; createSrc?: boolean } = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-preflight-'));
  await fs.mkdir(path.join(dir, '.trae/adr'), { recursive: true });
  // Sync the on-disk ADR list into memory.json so the fixture is self-consistent.
  const adrIds = (opts.adrs ?? []).map((a) => a.id);
  await writeMemory(dir, { adrs: adrIds, ...(opts.memoryOverrides ?? {}) });
  for (const a of opts.adrs ?? []) {
    await writeAdr(path.join(dir, '.trae/adr'), a.id, a.status);
  }
  if (opts.createSrc) {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src/index.ts'), '// empty fixture\n');
  }
  return dir;
}

describe('scripts/preflight.sh', () => {
  it('prints a text report with the expected decision marker', async () => {
    const cwd = await makeFixture({ adrs: [{ id: '0001' }], createSrc: true });
    try {
      const { exit, stdout } = await runPreflight(cwd);
      expect(exit).toBe(0);
      expect(stdout).toContain('Memory health');
      expect(stdout).toContain('[PASS]');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('--format=json produces valid JSON with the expected top-level keys', async () => {
    const cwd = await makeFixture({ adrs: [{ id: '0001' }], createSrc: true });
    try {
      const { exit, stdout } = await runPreflight(cwd, ['--format=json', '--no-color']);
      expect(exit).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('PASS');
      expect(report.root).toBe(cwd);
      expect(report.memory).toBeDefined();
      expect(report.memory.adrs_count).toBe(1);
      expect(report.adrs.count).toBe(1);
      expect(report.drift).toBeDefined();
      expect(report.drift.storage.count).toBe(0);
      expect(report.drift.runtime.count).toBe(0);
      expect(report.drift.vitest.count).toBe(0);
      expect(report.drift.pnpm_lock).toBe('no');
      expect(report.drift.yarn_lock).toBe('no');
      expect(report.hardblocks.count).toBe(0);
      expect(report.git).toBeDefined();
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('counts proposed ADRs and returns [WARN]', async () => {
    const cwd = await makeFixture({
      adrs: [{ id: '0001', status: 'proposed' }],
      createSrc: true,
    });
    try {
      const { exit, stdout } = await runPreflight(cwd, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.adrs.proposed).toBe(1);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('detects vitest residue in src/ and returns [WARN]', async () => {
    const cwd = await makeFixture({ adrs: [{ id: '0001' }], createSrc: true });
    try {
      // src/ is the actual surface we care about; tests/ may legitimately
      // contain a fixture referencing 'vitest' as part of this very test.
      await fs.writeFile(
        path.join(cwd, 'src/vitest-leak.ts'),
        "import { describe, it, expect } from 'vitest';\n"
      );
      const { exit, stdout } = await runPreflight(cwd, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.drift.vitest.count).toBe(1);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('detects pnpm-lock.yaml and returns [WARN]', async () => {
    const cwd = await makeFixture({ adrs: [{ id: '0001' }], createSrc: true });
    try {
      await fs.writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 5\n');
      const { exit, stdout } = await runPreflight(cwd, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.drift.pnpm_lock).toBe('yes');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('returns 2 + [BLOCK] when a .env file is added to the tree', async () => {
    const cwd = await makeFixture({ adrs: [{ id: '0001' }], createSrc: true });
    try {
      await fs.writeFile(path.join(cwd, '.env'), 'SECRET=1\n');
      const { exit, stdout } = await runPreflight(cwd, ['--format=json', '--no-color']);
      expect(exit).toBe(2);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('BLOCK');
      expect(report.hardblocks.count).toBeGreaterThan(0);
      // `find` emits `./.env` — match by suffix instead of exact equality.
      expect(report.hardblocks.files.some((f: string) => f.endsWith('.env'))).toBe(true);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('marks memory as invalid_json when the file is unparseable', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-preflight-'));
    try {
      await fs.mkdir(path.join(dir, '.trae/adr'), { recursive: true });
      await fs.writeFile(path.join(dir, '.trae/memory.json'), '{not valid json');
      const { exit, stdout } = await runPreflight(dir, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.memory.status).toBe('invalid_json');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('marks memory as missing when the file does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-preflight-'));
    try {
      await fs.mkdir(path.join(dir, '.trae/adr'), { recursive: true });
      const { exit, stdout } = await runPreflight(dir, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.memory.status).toBe('missing');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('detects stale decisions (>30 days old) and returns [WARN]', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-preflight-'));
    try {
      await fs.mkdir(path.join(dir, '.trae/adr'), { recursive: true });
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 60);
      const memory = {
        $schema: './memory.schema.json',
        version: '1.0',
        last_updated: '2026-06-04',
        last_updated_by: 'test',
        decisions: {
          runtime: { value: 'Bun', adrs: [], last_verified: ninetyDaysAgo.toISOString().slice(0, 10), confidence: 0.95, drift_signals: [], notes: '' },
        },
        core_modules: {},
        metrics: { test_count: 0, test_files: 0, test_status: '', typecheck: '0 errors', src_files: 0, lines_of_code_approx: 0 },
        verification: {
          last_verified_at: '2026-06-04',
          verifier: 'test',
          next_verification_due: '2026-07-04',
          known_issues: [],
        },
        adrs: [],
      };
      await fs.writeFile(path.join(dir, '.trae/memory.json'), JSON.stringify(memory, null, 2));
      const { exit, stdout } = await runPreflight(dir, ['--format=json', '--no-color']);
      expect(exit).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.decision).toBe('WARN');
      expect(report.memory.stale_count).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
