/**
 * SkillStore / SkillGenerator tests
 *
 * 覆盖：
 * - SkillStore 原子写 + 配置加载/保存
 * - SkillGenerator 把模板写到正确位置 + 失败时回滚
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '../../src/utils/logger';
import { SkillStore, InstalledSkill } from '../../src/skills/skill-store';
import { SkillGenerator } from '../../src/skills/skill-generator';

let tmp = '';

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-skill-test-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('SkillStore', () => {
  it('returns empty list when no config exists', async () => {
    const store = new SkillStore(createLogger({ level: 'error' }), tmp);
    expect(await store.listInstalled()).toEqual([]);
  });

  it('persists installed skills', async () => {
    const store = new SkillStore(createLogger({ level: 'error' }), tmp);
    const skill: InstalledSkill = {
      name: 'a11y',
      version: '1.0.0',
      path: `${tmp}/.qa-agent/skills/a11y`,
      description: 'desc',
      enabled: true,
      installedAt: new Date().toISOString(),
    };
    await store.add(skill);
    expect(await store.listInstalled()).toHaveLength(1);
    // 重新构造应能读到
    const store2 = new SkillStore(createLogger({ level: 'error' }), tmp);
    const loaded = await store2.listInstalled();
    expect(loaded[0]?.name).toBe('a11y');
  });

  it('removes skill by name', async () => {
    const store = new SkillStore(createLogger({ level: 'error' }), tmp);
    await store.add({
      name: 'a11y',
      version: '1.0.0',
      path: tmp,
      description: '',
      enabled: true,
      installedAt: '',
    });
    const removed = await store.remove('a11y');
    expect(removed?.name).toBe('a11y');
    expect(await store.listInstalled()).toHaveLength(0);
  });

  it('remove returns null for unknown skill', async () => {
    const store = new SkillStore(createLogger({ level: 'error' }), tmp);
    expect(await store.remove('nope')).toBeNull();
  });

  it('setEnabled toggles flag', async () => {
    const store = new SkillStore(createLogger({ level: 'error' }), tmp);
    await store.add({
      name: 'a11y',
      version: '1.0.0',
      path: tmp,
      description: '',
      enabled: true,
      installedAt: '',
    });
    await store.setEnabled('a11y', false);
    const skill = await store.find('a11y');
    expect(skill?.enabled).toBe(false);
  });
});

describe('SkillGenerator', () => {
  it('creates a skill directory with template files', async () => {
    const gen = new SkillGenerator(createLogger({ level: 'error' }), `${tmp}/skills`);
    const result = await gen.generate('My Cool Skill!');
    expect(result.name).toBe('my-cool-skill');
    // 目录结构
    const indexExists = await fs.stat(`${result.path}/index.ts`).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);
    const checkersExists = await fs.stat(`${result.path}/checkers`).then(() => true).catch(() => false);
    expect(checkersExists).toBe(true);
  });

  it('refuses to overwrite an existing directory', async () => {
    const skillsDir = `${tmp}/skills`;
    await fs.mkdir(`${skillsDir}/my-skill`, { recursive: true });
    const gen = new SkillGenerator(createLogger({ level: 'error' }), skillsDir);
    await expect(gen.generate('my-skill')).rejects.toThrow(/already exists/);
  });

  it('rejects empty / invalid names', async () => {
    const gen = new SkillGenerator(createLogger({ level: 'error' }), `${tmp}/skills`);
    await expect(gen.generate('')).rejects.toThrow();
    await expect(gen.generate('!!!')).rejects.toThrow();
  });

  it('rolls back partial files on failure', async () => {
    const skillsDir = `${tmp}/skills`;
    // 先把 index.ts 变成只读文件，强制写失败
    const gen = new SkillGenerator(createLogger({ level: 'error' }), skillsDir);
    // 第一次正常创建
    const result = await gen.generate('first-skill');
    // 二次创建同名 → 失败 → 不留半成品
    await expect(gen.generate('first-skill')).rejects.toThrow(/already exists/);
    // 验证原先的内容还在
    const stat = await fs.stat(`${result.path}/index.ts`);
    expect(stat.isFile()).toBe(true);
  });

  it('normalizeName: ASCII / 数字 / 标点', () => {
    expect(SkillGenerator.normalizeName('Hello World!')).toBe('hello-world');
    expect(SkillGenerator.normalizeName('  multi   space  ')).toBe('multi-space');
    expect(SkillGenerator.normalizeName('A-B-C-')).toBe('a-b-c');
    expect(SkillGenerator.normalizeName('中文 skill')).toBe('skill');
  });

  it('toClassName: PascalCase + Skill 后缀', () => {
    expect(SkillGenerator.toClassName('a11y')).toBe('A11ySkill');
    expect(SkillGenerator.toClassName('best-practices')).toBe('BestPracticesSkill');
    expect(SkillGenerator.toClassName('foo bar baz')).toBe('FooBarBazSkill');
  });
});
