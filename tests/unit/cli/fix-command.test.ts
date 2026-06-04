/**
 * Tests for the extracted `executeSingleFix` (cli/commands/fix.ts).
 *
 * The Commander-driven entrypoint (`runSingleFix`) calls process.exit on
 * bad input, but the core flow — registry lookup, skill.fix(), FixEngine
 * dispatch — is exported separately so it can be tested without spawning
 * a process or touching the real registry.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { executeSingleFix } from '../../../src/cli/commands/fix';
import { Logger } from '../../../src/utils/logger';
import { Diagnosis, Fix, SkillContext } from '../../../src/types';

interface FakeSkill {
  name: string;
  fix: (issue: Diagnosis, ctx: SkillContext) => Promise<Fix>;
}

function makeFakeBuilt(skill: FakeSkill | null, ctx?: Partial<SkillContext>) {
  const logger = new Logger({ level: 'info', quiet: true });
  const registry = {
    get: mock((name: string) => (name === skill?.name ? skill : null)),
  } as any;
  const context = ({ logger, project: { path: '/tmp' } } as any) as SkillContext;
  return { registry, context, logger, built: { registry, context, logger } };
}

function makeIssue(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 'issue-1',
    skill: 'fake-skill',
    type: 'code-quality',
    severity: 'warning',
    title: 'fake issue',
    description: 'fake issue description',
    location: { file: 'a.txt', line: 1 },
    ...overrides,
  };
}

function makeFix(changes: Fix['changes'], id = 'fix-1'): Fix {
  return {
    id,
    diagnosisId: 'issue-1',
    description: 'test fix',
    riskLevel: 'low',
    autoApplicable: true,
    changes,
  };
}

describe('cli/commands/fix.executeSingleFix', () => {
  let projectDir: string;
  let origExit: typeof process.exit;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-cli-fix-'));
    // process.exit should not actually kill the test runner.
    origExit = process.exit;
    (process as any).exit = mock((code?: number) => {
      throw new Error(`__process_exit:${code ?? 0}`);
    });
  });

  afterEach(async () => {
    (process as any).exit = origExit;
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('applies a low-risk insert fix end-to-end', async () => {
    const file = path.join(projectDir, 'a.txt');
    await fs.writeFile(file, 'line1\nline2', 'utf-8');

    const issue = makeIssue({ id: 'i-1', skill: 'fake-skill' });
    const fix = makeFix([
      { file: 'a.txt', type: 'insert', content: 'inserted', position: { line: 2 } },
    ]);
    const fakeSkill: FakeSkill = {
      name: 'fake-skill',
      fix: async () => fix,
    };
    const { built } = makeFakeBuilt(fakeSkill);
    const logger = new Logger({ level: 'info', quiet: true });

    await executeSingleFix(
      issue,
      { path: projectDir, dryRun: false, verify: false },
      {} as any,
      logger,
      built
    );

    expect(await fs.readFile(file, 'utf-8')).toBe('line1\ninserted\nline2');
  });

  it('creates a new file when inserting into a missing one (no trailing newline)', async () => {
    // Regression guard for the `''.split('\n')` trailing-newline bug,
    // exercised through the FixEngine path of the CLI command.
    const issue = makeIssue({ id: 'i-new', skill: 'fake-skill' });
    const fix = makeFix([
      { file: 'new.txt', type: 'insert', content: 'hello', position: { line: 1 } },
    ]);
    const fakeSkill: FakeSkill = {
      name: 'fake-skill',
      fix: async () => fix,
    };
    const { built } = makeFakeBuilt(fakeSkill);
    const logger = new Logger({ level: 'info', quiet: true });

    await executeSingleFix(
      issue,
      { path: projectDir, dryRun: false, verify: false },
      {} as any,
      logger,
      built
    );

    const content = await fs.readFile(path.join(projectDir, 'new.txt'), 'utf-8');
    expect(content).toBe('hello');
    expect(content.endsWith('\n')).toBe(false);
  });

  it('returns early (no error) when skill.fix produces an empty change list', async () => {
    const issue = makeIssue({ id: 'i-empty', skill: 'fake-skill' });
    const fakeSkill: FakeSkill = {
      name: 'fake-skill',
      fix: async () => makeFix([], 'noop'),
    };
    const { built } = makeFakeBuilt(fakeSkill);
    const logger = new Logger({ level: 'info', quiet: true });

    // Should not throw, should not call process.exit.
    await executeSingleFix(
      issue,
      { path: projectDir, dryRun: false, verify: false },
      {} as any,
      logger,
      built
    );
  });

  it('in dry-run mode does not touch the filesystem', async () => {
    const file = path.join(projectDir, 'a.txt');
    const original = 'untouched\n';
    await fs.writeFile(file, original, 'utf-8');

    const issue = makeIssue({ id: 'i-dry', skill: 'fake-skill' });
    const fix = makeFix([
      { file: 'a.txt', type: 'replace', oldContent: 'untouched', content: 'changed', line: 1 } as any,
    ]);
    const fakeSkill: FakeSkill = {
      name: 'fake-skill',
      fix: async () => fix,
    };
    const { built } = makeFakeBuilt(fakeSkill);
    const logger = new Logger({ level: 'info', quiet: true });

    await executeSingleFix(
      issue,
      { path: projectDir, dryRun: true, verify: false },
      {} as any,
      logger,
      built
    );

    expect(await fs.readFile(file, 'utf-8')).toBe(original);
  });

  it('exits with code 1 when the issue skill has no fix handler', async () => {
    const issue = makeIssue({ id: 'i-nofix', skill: 'no-fix-skill' });
    const { built } = makeFakeBuilt(null);
    const logger = new Logger({ level: 'info', quiet: true });

    await expect(
      executeSingleFix(
        issue,
        { path: projectDir, dryRun: false, verify: false },
        {} as any,
        logger,
        built
      )
    ).rejects.toThrow('__process_exit:1');
  });
});
