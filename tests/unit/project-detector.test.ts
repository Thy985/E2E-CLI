/**
 * project-detector tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { detectProjectInfo } from '../../src/utils/project-detector';

let tmp = '';

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-detector-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writePkg(json: object): Promise<void> {
  await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify(json), 'utf-8');
}

describe('detectProjectInfo', () => {
  it('returns defaults when no package.json exists', async () => {
    const info = await detectProjectInfo(tmp);
    expect(info.name).toBe(path.basename(tmp));
    expect(info.framework).toBeUndefined();
    expect(info.type).toBe('webapp');
    expect(info.packageManager).toBe('npm');
  });

  it('reads name from package.json', async () => {
    await writePkg({ name: 'cool-app' });
    const info = await detectProjectInfo(tmp);
    expect(info.name).toBe('cool-app');
  });

  it('detects react framework', async () => {
    await writePkg({ dependencies: { react: '^18.0.0' } });
    const info = await detectProjectInfo(tmp);
    expect(info.framework).toBe('react');
  });

  it('detects vue from devDependencies too', async () => {
    await writePkg({ devDependencies: { vue: '^3.0.0' } });
    const info = await detectProjectInfo(tmp);
    expect(info.framework).toBe('vue');
  });

  it('detects api type from express', async () => {
    await writePkg({ dependencies: { express: '^4.0.0' } });
    const info = await detectProjectInfo(tmp);
    expect(info.type).toBe('api');
  });

  it('detects cli type from bin field', async () => {
    await writePkg({ bin: { foo: 'dist/foo.js' } });
    const info = await detectProjectInfo(tmp);
    expect(info.type).toBe('cli');
  });

  it('detects library type from typescript without frontend', async () => {
    await writePkg({ devDependencies: { typescript: '^5.0.0' } });
    const info = await detectProjectInfo(tmp);
    expect(info.type).toBe('library');
  });

  it('detects pnpm package manager', async () => {
    await writePkg({ name: 'x' });
    await fs.writeFile(path.join(tmp, 'pnpm-lock.yaml'), '', 'utf-8');
    const info = await detectProjectInfo(tmp);
    expect(info.packageManager).toBe('pnpm');
  });

  it('overrides take precedence over package.json', async () => {
    await writePkg({ name: 'pkg', dependencies: { react: '^18.0.0' } });
    const info = await detectProjectInfo(tmp, {
      name: 'forced',
      framework: 'svelte',
      type: 'cli',
    });
    expect(info.name).toBe('forced');
    expect(info.framework).toBe('svelte');
    expect(info.type).toBe('cli');
  });

  it('falls back to package.json when override is undefined', async () => {
    await writePkg({ name: 'pkg', dependencies: { react: '^18.0.0' } });
    const info = await detectProjectInfo(tmp, { type: 'api' });
    expect(info.name).toBe('pkg');
    expect(info.framework).toBe('react');
    expect(info.type).toBe('api');
  });
});
