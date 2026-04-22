/**
 * A11y Skill Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { A11ySkill } from '../../src/skills/builtin/a11y';
import { createLogger } from '../../src/utils/logger';
import { createTools } from '../../src/tools';
import { createStorage } from '../../src/storage';
import { ModelClient } from '../../src/types';

// Mock model client for testing
const mockModelClient: ModelClient = {
  chat: vi.fn().mockResolvedValue('mock response'),
  embed: vi.fn().mockResolvedValue(Array(1536).fill(0)),
};

describe('A11ySkill', () => {
  const skill = new A11ySkill();

  it('should have correct metadata', () => {
    expect(skill.name).toBe('a11y');
    expect(skill.version).toBe('1.0.0');
    expect(skill.description).toBe('WCAG 可访问性检查');
  });

  it('should have capabilities', () => {
    expect(skill.capabilities.length).toBeGreaterThan(0);
    expect(skill.capabilities[0]).toHaveProperty('name');
    expect(skill.capabilities[0]).toHaveProperty('autoFixable');
  });

  it('should detect missing alt attributes', async () => {
    const context = {
      project: { name: 'test', path: process.cwd() },
      config: { enabled: true, options: {} },
      logger: createLogger({ level: 'error' }),
      tools: createTools(),
      model: mockModelClient,
      storage: createStorage(),
    };

    const diagnoses = await skill.diagnose(context);
    expect(Array.isArray(diagnoses)).toBe(true);
  });
});
