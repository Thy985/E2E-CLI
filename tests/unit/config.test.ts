/**
 * Config tests
 */
import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseConfigFile } from '../../src/config';

describe('Config YAML parsing', () => {
  it('parses a simple yaml config', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-yaml-'));
    const file = path.join(tmp, 'config.yaml');
    fs.writeFileSync(
      file,
      [
        'version: 1',
        'project:',
        '  name: my-app',
        '  type: webapp',
        'skills:',
        '  enabled:',
        '    - a11y',
        '    - e2e',
        '',
      ].join('\n'),
      'utf-8'
    );

    const config = await parseConfigFile(file);
    expect(config.version).toBe(1);
    expect(config.project?.name).toBe('my-app');
    expect(config.project?.type).toBe('webapp');
    expect(config.skills?.enabled).toEqual(['a11y', 'e2e']);
  });

  it('handles comments with colons', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-yaml-'));
    const file = path.join(tmp, 'config.yaml');
    fs.writeFileSync(
      file,
      [
        'version: 1',
        '# this is a: comment with colon',
        'project:',
        '  name: my-app # inline: comment',
        '',
      ].join('\n'),
      'utf-8'
    );

    const config = await parseConfigFile(file);
    expect(config.project?.name).toBe('my-app');
  });

  it('handles nested structures and quoted strings', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-yaml-'));
    const file = path.join(tmp, 'config.yaml');
    fs.writeFileSync(
      file,
      [
        'version: 1',
        'project:',
        '  name: "my: app"',
        'rules:',
        '  max_complexity: 10',
        '  strict_mode: true',
        '',
      ].join('\n'),
      'utf-8'
    );

    const config = await parseConfigFile(file);
    expect(config.project?.name).toBe('my: app');
  });

  it('rejects yaml whose root is an array', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-yaml-'));
    const file = path.join(tmp, 'config.yaml');
    fs.writeFileSync(file, '- 1\n- 2\n', 'utf-8');

    await expect(parseConfigFile(file)).rejects.toThrow(/must be a mapping/);
  });
});
