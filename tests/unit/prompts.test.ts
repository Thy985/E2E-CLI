/**
 * Tests for the prompt registry
 */

import { describe, it, expect } from 'bun:test';
import { registerPrompt, getPrompt, getPromptTemplate, listPrompts } from '../../src/prompts/registry';

describe('prompt registry', () => {
  it('returns a registered prompt with all variables rendered', () => {
    const t = getPrompt('ai-fix', {
      title: 'Title T',
      description: 'Description D',
      file: 'src/x.ts',
      line: '42',
      severity: 'medium',
      codeContext: 'const x = 1;',
    });
    expect(t.system).toContain('expert frontend developer');
    expect(t.user).toContain('Title T');
    expect(t.user).toContain('Description D');
    expect(t.user).toContain('src/x.ts');
    expect(t.user).toContain('42');
    expect(t.user).not.toContain('{{');
    expect(t.template.id).toBe('ai-fix');
    expect(t.template.version).toBe('1.0.0');
    expect(t.template.expectJson).toBe(true);
  });

  it('throws when a required variable is missing', () => {
    // Pass empty ctx — the first variable in the template triggers the throw.
    // We just verify the error message format, not which variable is first.
    expect(() => getPrompt('ai-fix', {} as any)).toThrow(/not provided/);
  });

  it('lists registered prompts', () => {
    const all = listPrompts();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((p) => p.id === 'ai-fix')).toBe(true);
    expect(all.some((p) => p.id === 'actor-plan')).toBe(true);
    expect(all.some((p) => p.id === 'e2e-testgen')).toBe(true);
  });

  it('returns the latest version when multiple are registered', () => {
    registerPrompt({
      id: '__test_multi',
      version: '1.5.0',
      system: 'sys v1.5',
      user: 'user v1.5',
    });
    registerPrompt({
      id: '__test_multi',
      version: '1.0.0',
      system: 'sys v1.0',
      user: 'user v1.0',
    });
    const t = getPromptTemplate('__test_multi');
    expect(t.version).toBe('1.5.0');
  });

  it('pins to a specific version when requested', () => {
    const t = getPromptTemplate('__test_multi', '1.0.0');
    expect(t.version).toBe('1.0.0');
    expect(t.system).toBe('sys v1.0');
  });

  it('throws when an unknown prompt is requested', () => {
    expect(() => getPromptTemplate('__not_a_real_id')).toThrow(/not found/);
  });

  it('rejects duplicate registration of same id+version', () => {
    expect(() =>
      registerPrompt({
        id: '__test_dup',
        version: '1.0.0',
        system: 's',
        user: 'u',
      })
    ).not.toThrow();
    expect(() =>
      registerPrompt({
        id: '__test_dup',
        version: '1.0.0',
        system: 's2',
        user: 'u2',
      })
    ).toThrow(/already registered/);
  });
});
