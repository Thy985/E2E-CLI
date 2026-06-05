/**
 * SkillRegistry Tests
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { SkillRegistry, createSkillRegistry } from '../../src/skills/registry';
import { Skill, SkillContext, SkillCapability, SkillTrigger, Diagnosis } from '../../src/types';
import { Logger, createLogger } from '../../src/utils/logger';

class MockSkill implements Skill {
  name: string;
  version: string = '1.0.0';
  description: string = 'Mock skill';
  triggers: SkillTrigger[] = [{ type: 'command', pattern: 'mock' }];
  capabilities: SkillCapability[] = [
    { name: 'mock-cap', description: 'Mock capability', autoFixable: true, riskLevel: 'low' }
  ];

  constructor(name: string) {
    this.name = name;
  }

  async diagnose(_context: SkillContext): Promise<Diagnosis[]> {
    return [];
  }
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({ level: 'error' });
    registry = createSkillRegistry(logger);
  });

  describe('register', () => {
    it('should register a skill', () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      expect(registry.has('test-skill')).toBe(true);
    });

    it('should overwrite existing skill with same name', () => {
      const skill1 = new MockSkill('test-skill');
      const skill2 = new MockSkill('test-skill');

      registry.register(skill1);
      registry.register(skill2);

      expect(registry.get('test-skill')).toBe(skill2);
    });
  });

  describe('unregister', () => {
    it('should unregister existing skill', () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      const result = registry.unregister('test-skill');

      expect(result).toBe(true);
      expect(registry.has('test-skill')).toBe(false);
    });

    it('should return false for non-existent skill', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should return registered skill', () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      const result = registry.get('test-skill');

      expect(result).toBe(skill);
    });

    it('should return undefined for non-existent skill', () => {
      const result = registry.get('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered skill', () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      expect(registry.has('test-skill')).toBe(true);
    });

    it('should return false for non-registered skill', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all registered skills', () => {
      registry.register(new MockSkill('skill1'));
      registry.register(new MockSkill('skill2'));

      const skills = registry.getAll();

      expect(skills).toHaveLength(2);
    });

    it('should return empty array when no skills registered', () => {
      const skills = registry.getAll();
      expect(skills).toHaveLength(0);
    });
  });

  describe('getNames', () => {
    it('should return all skill names', () => {
      registry.register(new MockSkill('skill1'));
      registry.register(new MockSkill('skill2'));

      const names = registry.getNames();

      expect(names).toContain('skill1');
      expect(names).toContain('skill2');
    });
  });

  describe('getInfo', () => {
    it('should return skill info', () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      const info = registry.getInfo('test-skill');

      expect(info).toEqual({
        name: 'test-skill',
        version: '1.0.0',
        description: 'Mock skill',
        capabilities: ['mock-cap'],
        autoFixable: true,
      });
    });

    it('should return undefined for non-existent skill', () => {
      const info = registry.getInfo('non-existent');
      expect(info).toBeUndefined();
    });
  });

  describe('getAllInfo', () => {
    it('should return info for all skills', () => {
      registry.register(new MockSkill('skill1'));
      registry.register(new MockSkill('skill2'));

      const infoList = registry.getAllInfo();

      expect(infoList).toHaveLength(2);
    });
  });

  describe('findByIntent', () => {
    it('should find skills matching intent by name', () => {
      registry.register(new MockSkill('accessibility'));

      const results = registry.findByIntent('accessibility');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should find skills matching intent by trigger', () => {
      registry.register(new MockSkill('my-test'));

      const results = registry.findByIntent('my-test');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when no match', () => {
      const results = registry.findByIntent('xyz123');
      expect(results).toHaveLength(0);
    });
  });

  describe('runDiagnosis', () => {
    it('should skip non-existent skill and not add to results', async () => {
      const context = createMockContext();
      const results = await registry.runDiagnosis(['non-existent'], context);

      expect(results.has('non-existent')).toBe(false);
    });

    it('should run diagnosis for registered skills', async () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      const context = createMockContext();
      const results = await registry.runDiagnosis(['test-skill'], context);

      expect(results.has('test-skill')).toBe(true);
    });
  });

  describe('initializeAll', () => {
    it('should handle skills without init method', async () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      const context = createMockContext();
      await registry.initializeAll(context);
    });
  });

  describe('cleanupAll', () => {
    it('should handle skills without cleanup method', async () => {
      const skill = new MockSkill('test-skill');
      registry.register(skill);

      await registry.cleanupAll();
    });
  });

  describe('count', () => {
    it('should return correct count', () => {
      registry.register(new MockSkill('skill1'));
      registry.register(new MockSkill('skill2'));

      expect(registry.count).toBe(2);
    });

    it('should return 0 when no skills registered', () => {
      expect(registry.count).toBe(0);
    });
  });
});

function createMockContext(): SkillContext {
  return {
    project: { name: 'test', path: process.cwd() },
    config: { version: 1, project: { name: 'test' } },
    logger: createLogger({ level: 'error' }),
    tools: {
      fs: {
        readFile: mock(async (_path: string) => ''),
        writeFile: mock(async (_path: string, _content: string) => undefined),
        exists: mock(async (_path: string) => false),
        glob: mock(async () => [] as string[]),
        mkdir: mock(async (_path: string) => undefined),
        remove: mock(async (_path: string) => undefined),
        stat: mock(async (_path: string) => ({ size: 0, isFile: true, isDirectory: false })),
      },
      git: {
        getChangedFiles: mock(async () => [] as string[]),
        getCurrentBranch: mock(async () => 'main'),
        getCommitHash: mock(async () => 'abc123'),
      },
      shell: {
        execute: mock(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      },
    },
    model: {
      chat: mock(async () => ''),
    },
    storage: {
      get: mock(async () => null),
      set: mock(async () => undefined),
      delete: mock(async () => true),
      has: mock(async () => true),
      keys: mock(async () => [] as string[]),
      clear: mock(async () => undefined),
      flush: mock(async () => undefined),
    },
  };
}
