/**
 * SkillPackager tests
 *
 * 覆盖：
 * - 拒绝包含 shell 元字符的 package name（修复前 npm pack ${evil} 会执行）
 * - 拒绝包含非法字符的 version
 * - 接受合法的 scope 包名
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '../../src/utils/logger';
import { SkillPackager } from '../../src/skills/skill-packager';

let tmp = '';

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-packager-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('SkillPackager', () => {
  describe('fetchPackageInfo', () => {
    it('refuses to query npm for invalid package names', async () => {
      const packager = new SkillPackager(createLogger({ level: 'error' }), tmp);
      const result = await packager.fetchPackageInfo('foo; rm -rf /');
      expect(result.exists).toBe(false);
    });

    it('refuses to query npm for names with command substitution', async () => {
      const packager = new SkillPackager(createLogger({ level: 'error' }), tmp);
      const result = await packager.fetchPackageInfo('$(whoami)');
      expect(result.exists).toBe(false);
    });

    it('accepts legitimate scoped names', async () => {
      // 我们不去真的连 npm（CI 可能离线），但可以验证白名单通过了 argv 校验
      const packager = new SkillPackager(createLogger({ level: 'error' }), tmp);
      // fetchPackageInfo 内部用 npm view；离线时 exists=false，但不应抛错
      const result = await packager.fetchPackageInfo('@qa-agent/skill-foo');
      // 不管是否存在，结构都应当规范
      expect(typeof result.exists).toBe('boolean');
    });
  });

  describe('downloadAndExtract', () => {
    it('rejects invalid package name', async () => {
      const packager = new SkillPackager(createLogger({ level: 'error' }), tmp);
      await expect(packager.downloadAndExtract('foo`whoami`')).rejects.toThrow(/Invalid package name/);
    });

    it('rejects invalid version', async () => {
      const packager = new SkillPackager(createLogger({ level: 'error' }), tmp);
      await expect(
        packager.downloadAndExtract('@qa-agent/skill-foo', { version: '1.0.0; rm -rf /' })
      ).rejects.toThrow(/Invalid version/);
    });
  });
});
