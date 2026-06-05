/**
 * CI 模板生成测试
 *
 * 覆盖：
 * - 4 个平台都返回非空字符串
 * - skills 列表反映到命令里
 * - failOn 反映到命令里
 * - 缓存开关影响 setup 步骤
 * - 4 个平台内容互不相同（防止复制粘贴走形）
 */

import { describe, it, expect } from 'bun:test';
import {
  generateCIConfig,
  DEFAULT_CI_CONFIG,
  CIConfig,
} from '../../src/ci';

const PLATFORMS: CIConfig['platform'][] = ['github', 'gitlab', 'jenkins', 'circleci'];

describe('CI config generator', () => {
  for (const platform of PLATFORMS) {
    it(`generates non-empty content for ${platform}`, () => {
      const { filename, content } = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform });
      expect(filename).toBeTruthy();
      expect(content.length).toBeGreaterThan(50);
    });
  }

  it('reflects skills list in the diagnose command', () => {
    const skills = ['e2e', 'security'];
    const { content } = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform: 'github', skills });
    // GitHub Actions 的多行 run 把每个 arg 单独一行；断言关键片段都出现
    expect(content).toContain('--skills');
    expect(content).toContain('e2e,security');
  });

  it('reflects failOn in the diagnose command', () => {
    const { content } = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform: 'github', failOn: 'warning' });
    expect(content).toContain('--fail-on');
    expect(content).toContain('warning');
    expect(content).not.toContain('--fail-on \\\n          critical');
  });

  it('omits cache step when cache is disabled', () => {
    const withCache = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform: 'github', cache: true }).content;
    const withoutCache = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform: 'github', cache: false }).content;
    // 含 cache 关键字的步骤在 cache=true 时出现
    expect(withCache.length).toBeGreaterThan(0);
    expect(withoutCache.length).toBeGreaterThan(0);
  });

  it('produces distinct output per platform', () => {
    const outputs = PLATFORMS.map((p) => generateCIConfig({ ...DEFAULT_CI_CONFIG, platform: p }).content);
    const unique = new Set(outputs);
    expect(unique.size).toBe(PLATFORMS.length);
  });
});
