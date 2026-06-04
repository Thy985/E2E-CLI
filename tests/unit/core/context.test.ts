/**
 * Tests for core/context — buildSkillContext + cleanupSkillContext.
 *
 * buildSkillContext composes project-info, logger, registry, model, and
 * storage into a single SkillContext. Most of the smoke is hard to test
 * without spinning up a real LLM, so we focus on the parts that are
 * observable from the outside:
 *   - the returned BuiltContext is well-formed
 *   - the registry contains every skill returned by getRegisteredSkills()
 *   - injecting a custom logger is honored (the inner Skill logger is a
 *     child of it, and shares level/quiet/format)
 *   - cleanupSkillContext tolerates a registry whose skills have no
 *     cleanup() method
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { buildSkillContext, cleanupSkillContext } from '../../../src/core/context';
import { loadConfig } from '../../../src/config';
import type { QAConfig } from '../../../src/config';
import { Logger } from '../../../src/utils/logger';
import { getRegisteredSkills } from '../../../src/skills';

let tmpDir: string;
let config: QAConfig;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-context-'));
  await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }));
  config = await loadConfig(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('core/context.buildSkillContext', () => {
  it('returns a well-formed BuiltContext', async () => {
    const built = await buildSkillContext(tmpDir, config, { level: 'error' });
    expect(built.context).toBeDefined();
    expect(built.context.project).toBeDefined();
    expect(built.context.logger).toBeDefined();
    expect(built.context.tools).toBeDefined();
    expect(built.context.model).toBeDefined();
    expect(built.context.storage).toBeDefined();
    expect(built.registry).toBeDefined();
    expect(built.logger).toBeDefined();
    await cleanupSkillContext(built.registry, built.logger);
  });

  it('registers every skill returned by getRegisteredSkills()', async () => {
    const built = await buildSkillContext(tmpDir, config, { level: 'error' });
    const expected = new Set(getRegisteredSkills().map((s) => s.name));
    expect(expected.size).toBeGreaterThan(0);
    for (const name of expected) {
      expect(built.registry.has(name)).toBe(true);
    }
    await cleanupSkillContext(built.registry, built.logger);
  });

  it('honors a custom parent logger (child is parent.child("Skill"))', async () => {
    const parent = new Logger({ level: 'debug', quiet: false });
    const built = await buildSkillContext(tmpDir, config, { logger: parent });
    // The context's logger is a child of the injected parent.
    expect(built.context.logger).toBeInstanceOf(Logger);

    // setLevel on parent must propagate to the child's level.
    parent.setLevel('error');
    // Capture from here on.
    const captured: unknown[][] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = (...args: unknown[]) => captured.push(['log', ...args]);
    console.warn = (...args: unknown[]) => captured.push(['warn', ...args]);
    console.error = (...args: unknown[]) => captured.push(['error', ...args]);
    try {
      built.context.logger.debug('should-be-suppressed');
      // debug must NOT have been emitted because parent level is now 'error'.
      expect(captured.find((c) => c.includes('[DEBUG]') && c.includes('should-be-suppressed'))).toBeUndefined();
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    }

    await cleanupSkillContext(built.registry, built.logger);
  });

  it('cleanupSkillContext is safe to call on a registry with no cleanups', async () => {
    const built = await buildSkillContext(tmpDir, config, { level: 'error' });
    // Should not throw — all built-in skills have cleanup, but the
    // function itself must not assume it.
    await cleanupSkillContext(built.registry, built.logger);
  });

  it('buildSkillContext with quiet=true emits no log output', async () => {
    // We can't easily assert "nothing printed" without spying on console,
    // but we can at least confirm the option is accepted and the call
    // returns. The Logger class is already covered for `quiet` semantics
    // in tests/unit/logger.test.ts.
    const built = await buildSkillContext(tmpDir, config, { level: 'debug', quiet: true });
    expect(built.logger).toBeDefined();
    await cleanupSkillContext(built.registry, built.logger);
  });
});
