import { describe, expect, it } from 'bun:test';
import { PerformanceSkill } from '../../src/skills/builtin/performance/index';
import { Diagnosis, SkillContext } from '../../src/types';

function makeContext(): SkillContext {
  const noopFs = {
    readFile: async () => '',
    writeFile: async () => undefined,
    exists: async () => true,
    glob: async () => [],
    mkdir: async () => undefined,
    remove: async () => undefined,
    stat: async () => ({ size: 0, isFile: true, isDirectory: false }),
  };
  return {
    project: { name: 'p', path: '/tmp', type: 'webapp' },
    config: { version: '1', project: { name: 'p', path: '/tmp', type: 'webapp' } },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    tools: { fs: noopFs, git: {} as any, shell: {} as any },
    model: { chat: async () => '' },
    storage: {} as any,
  } as unknown as SkillContext;
}

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 'p-1',
    skill: 'performance',
    type: 'performance',
    severity: 'warning',
    title: 'test',
    description: 'test',
    location: { file: 'a.ts', line: 2, column: 1 },
    metadata: { ruleId: 'large-bundle' },
    ...overrides,
  };
}

describe('PerformanceSkill - fix() via getTargetLine + buildFileChange', () => {
  const skill = new PerformanceSkill();

  it('large-bundle fix: rewrites lodash import to TODO comment', async () => {
    const content = 'import _ from "lodash";\nconsole.log(_);';
    const ctx = makeContext();
    (ctx.tools.fs.readFile as any) = async () => content;

    const fix = await skill.fix(
      makeDiagnosis({
        location: { file: 'a.ts', line: 1, column: 1 },
        metadata: { ruleId: 'large-bundle' },
      }),
      ctx
    );

    expect(fix.changes).toHaveLength(1);
    const change = fix.changes[0];
    expect(change.type).toBe('replace');
    expect(change.oldContent).toBe('import _ from "lodash";');
    expect(change.content).toContain('TODO');
    expect(change.position?.line).toBe(1);
  });

  it('sync-script fix: adds defer attribute', async () => {
    const content = '<html>\n<script src="x.js"></script>\n</html>';
    const ctx = makeContext();
    (ctx.tools.fs.readFile as any) = async () => content;

    const fix = await skill.fix(
      makeDiagnosis({
        location: { file: 'index.html', line: 2, column: 1 },
        metadata: { ruleId: 'sync-script' },
      }),
      ctx
    );

    expect(fix.changes[0].oldContent).toBe('<script src="x.js"></script>');
    expect(fix.changes[0].content).toBe('<script defer src="x.js"></script>');
  });

  it('console-log fix: comments out console statement', async () => {
    const content = 'function f() {\n  console.log("hi");\n}';
    const ctx = makeContext();
    (ctx.tools.fs.readFile as any) = async () => content;

    const fix = await skill.fix(
      makeDiagnosis({
        location: { file: 'a.ts', line: 2, column: 1 },
        metadata: { ruleId: 'console-log' },
      }),
      ctx
    );

    expect(fix.changes[0].oldContent).toBe('  console.log("hi");');
    expect(fix.changes[0].content).toContain('//');
  });

  it('throws on unknown rule id', async () => {
    const ctx = makeContext();
    (ctx.tools.fs.readFile as any) = async () => '';

    await expect(
      skill.fix(
        makeDiagnosis({ metadata: { ruleId: 'nonexistent' } }),
        ctx
      )
    ).rejects.toThrow(/Cannot auto-fix/);
  });

  it('duplicate-deps fix: removes duplicates from devDependencies', async () => {
    const content = JSON.stringify({
      devDependencies: { 'foo': '1.0.0', 'bar': '2.0.0' },
    });
    const ctx = makeContext();
    (ctx.tools.fs.readFile as any) = async () => content;

    const fix = await skill.fix(
      makeDiagnosis({
        location: { file: 'package.json', line: 1, column: 1 },
        metadata: { ruleId: 'duplicate-deps', duplicates: ['foo'] },
      }),
      ctx
    );

    expect(fix.changes[0].oldContent).toBe(content);
    const newPkg = JSON.parse(fix.changes[0].content!);
    expect(newPkg.devDependencies.foo).toBeUndefined();
    expect(newPkg.devDependencies.bar).toBe('2.0.0');
  });
});
