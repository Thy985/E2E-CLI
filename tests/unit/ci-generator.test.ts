import { describe, expect, it } from 'bun:test';
import { generateCIConfig, detectCIPlatform } from '../../src/ci';
import { DEFAULT_CI_CONFIG } from '../../src/ci';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('CI generator - 4 platforms', () => {
  it('GitHub config: filename and steps', () => {
    const { filename, content } = generateCIConfig({
      ...DEFAULT_CI_CONFIG,
      platform: 'github',
      skills: ['a11y', 'seo'],
      failOn: 'critical',
      outputFormat: 'json',
    });
    expect(filename).toBe('.github/workflows/qa-agent.yml');
    expect(content).toContain('qa-agent');
    expect(content).toContain('a11y');
    expect(content).toContain('seo');
  });

  it('GitLab config: filename is .gitlab-ci.yml', () => {
    const { filename, content } = generateCIConfig({
      ...DEFAULT_CI_CONFIG,
      platform: 'gitlab',
    });
    expect(filename).toBe('.gitlab-ci.yml');
    expect(content.length).toBeGreaterThan(0);
  });

  it('Jenkins config: filename is Jenkinsfile', () => {
    const { filename, content } = generateCIConfig({
      ...DEFAULT_CI_CONFIG,
      platform: 'jenkins',
    });
    expect(filename).toBe('Jenkinsfile');
    expect(content).toContain('pipeline');
  });

  it('CircleCI config: filename is .circleci/config.yml', () => {
    const { filename } = generateCIConfig({
      ...DEFAULT_CI_CONFIG,
      platform: 'circleci',
    });
    expect(filename).toBe('.circleci/config.yml');
  });

  it('all 4 platforms return a non-empty string content', () => {
    for (const platform of ['github', 'gitlab', 'jenkins', 'circleci'] as const) {
      const { content } = generateCIConfig({ ...DEFAULT_CI_CONFIG, platform });
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

describe('CI detector - platform auto-detection', () => {
  it('detects GitHub Actions when .github/workflows exists', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ci-detect-'));
    try {
      await fsp.mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
      const platform = await detectCIPlatform(dir);
      expect(platform).toBe('github');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('detects GitLab when .gitlab-ci.yml exists', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ci-detect-'));
    try {
      await fsp.writeFile(path.join(dir, '.gitlab-ci.yml'), 'image: alpine');
      const platform = await detectCIPlatform(dir);
      expect(platform).toBe('gitlab');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined when no CI config exists', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ci-detect-'));
    try {
      const platform = await detectCIPlatform(dir);
      expect(platform == null).toBe(true);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
