/**
 * Tests for core/project-info
 *
 * Verifies: config wins over auto-detection; auto-detects framework + type
 * from package.json; gracefully handles missing package.json.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { getProjectInfo } from '../../../src/core/project-info';
import { QAConfig } from '../../../src/config';

describe('core/project-info', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('falls back to directory name when no package.json and no config', async () => {
    const info = await getProjectInfo(tmpDir);
    expect(info.name).toBe(path.basename(tmpDir));
    expect(info.path).toBe(tmpDir);
    expect(info.type).toBe('webapp');
    expect(info.framework).toBeUndefined();
  });

  it('uses config values when provided (no package.json read)', async () => {
    const config: Partial<QAConfig> = {
      project: { name: 'configured-name', type: 'api', framework: 'next' },
    };
    const info = await getProjectInfo(tmpDir, { config: config as QAConfig });
    expect(info.name).toBe('configured-name');
    expect(info.type).toBe('api');
    expect(info.framework).toBe('next');
  });

  it('auto-detects react framework from package.json', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^18.0.0' } })
    );
    const info = await getProjectInfo(tmpDir);
    expect(info.framework).toBe('react');
    expect(info.name).toBe('my-app');
  });

  it('auto-detects CLI type when package.json has bin field', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-cli', bin: { 'my-cli': './bin.js' } })
    );
    const info = await getProjectInfo(tmpDir);
    expect(info.type).toBe('cli');
  });

  it('auto-detects API type when express/fastify/koa in deps', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-api', dependencies: { express: '^4.0.0' } })
    );
    const info = await getProjectInfo(tmpDir);
    expect(info.type).toBe('api');
  });

  it('detects library type (typescript, no UI deps)', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-lib', dependencies: { typescript: '^5.0.0' } })
    );
    const info = await getProjectInfo(tmpDir);
    expect(info.type).toBe('library');
  });

  it('config wins over package.json auto-detection', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'pkg-name', dependencies: { react: '^18.0.0' } })
    );
    const config: Partial<QAConfig> = {
      project: { name: 'cfg-name', framework: 'vue' },
    };
    const info = await getProjectInfo(tmpDir, { config: config as QAConfig });
    expect(info.name).toBe('cfg-name');
    expect(info.framework).toBe('vue');
  });
});
