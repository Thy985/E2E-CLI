/**
 * Security Skill Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecuritySkill } from '../../src/skills/builtin/security';
import { SkillContext, Browser, Page } from '../../src/types';

// Mock browser and page
const mockPage: Page = {
  goto: async () => {},
  screenshot: async () => Buffer.from(''),
  content: async () => '',
  evaluate: async <T>(_fn: () => T) => null as unknown as T,
  close: async () => {},
};

const mockBrowser: Browser = {
  newPage: async () => mockPage,
  close: async () => {},
};

describe('SecuritySkill', () => {
  let skill: SecuritySkill;
  let mockContext: SkillContext;

  beforeEach(() => {
    skill = new SecuritySkill();

    mockContext = {
      project: {
        name: 'test-project',
        path: '/test/project',
        type: 'webapp',
        framework: 'react',
      },
      config: {
        enabled: true,
        options: {},
      },
      tools: {
        fs: {
          readFile: async () => '',
          writeFile: async () => {},
          exists: async () => false,
          glob: async () => [],
          mkdir: async () => {},
          remove: async () => {},
          stat: async () => ({ size: 0, isFile: true, isDirectory: false }),
        },
        browser: {
          launch: async () => mockBrowser,
          newPage: async () => mockPage,
          close: async () => {},
        },
        git: {
          getChangedFiles: async () => [],
          getCurrentBranch: async () => 'main',
          getCommitHash: async () => 'abc123',
        },
        shell: {
          execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        },
      },
      model: {
        chat: async () => 'mock response',
        embed: async () => [0.1, 0.2, 0.3],
      },
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        clear: async () => {},
      },
      logger: {
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
      },
    };
  });

  describe('Skill metadata', () => {
    it('should have correct name', () => {
      expect(skill.name).toBe('security');
    });

    it('should have correct version', () => {
      expect(skill.version).toBe('1.0.0');
    });

    it('should have triggers defined', () => {
      expect(skill.triggers).toBeDefined();
      expect(skill.triggers.length).toBeGreaterThan(0);
    });

    it('should have capabilities defined', () => {
      expect(skill.capabilities).toBeDefined();
      expect(skill.capabilities.length).toBeGreaterThan(0);
    });
  });

  describe('checkFile - hardcoded secrets', () => {
    it('should detect hardcoded password', async () => {
      const content = `const password = "mySecretPassword123";`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('hardcoded-secret');
      expect(diagnoses[0].severity).toBe('critical');
    });

    it('should detect hardcoded API key', async () => {
      const content = `const apiKey = "sk-1234567890abcdef";`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('hardcoded-secret');
    });

    it('should detect hardcoded private key', async () => {
      const content = `const privateKey = "-----BEGIN PRIVATE KEY-----";`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('hardcoded-secret');
    });
  });

  describe('checkFile - SQL injection', () => {
    it('should detect SQL injection with template literal', async () => {
      const content = `db.query(\`SELECT * FROM users WHERE id = \${userId}\`);`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('sql-injection');
    });

    it('should detect SQL injection with string concatenation', async () => {
      const content = `db.execute('SELECT * FROM users WHERE id = ' + userId);`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('sql-injection');
    });
  });

  describe('checkFile - XSS risks', () => {
    it('should detect dangerouslySetInnerHTML', async () => {
      const content = `<div dangerouslySetInnerHTML={{ __html: userInput }} />`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.tsx', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('xss-risk');
    });

    it('should detect innerHTML assignment', async () => {
      const content = `element.innerHTML = '<p>' + userInput + '</p>';`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('xss-risk');
    });

    it('should detect document.write', async () => {
      const content = `document.write(userContent);`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('xss-risk');
    });
  });

  describe('checkFile - eval usage', () => {
    it('should detect eval usage', async () => {
      const content = `eval(userInput);`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('eval-usage');
    });

    it('should detect new Function usage', async () => {
      const content = `new Function('return ' + code)();`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('eval-usage');
    });
  });

  describe('checkFile - insecure random', () => {
    it('should detect Math.random usage', async () => {
      const content = `const token = Math.random().toString(36);`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('insecure-random');
      expect(diagnoses[0].severity).toBe('info');
    });
  });

  describe('checkFile - insecure HTTP', () => {
    it('should detect insecure HTTP URL', async () => {
      const content = `fetch('http://api.example.com/data');`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('http-url');
    });

    it('should not flag localhost HTTP', async () => {
      const content = `fetch('http://localhost:3000/api');`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.some(d => d.metadata.ruleId === 'http-url')).toBe(false);
    });

    it('should not flag 127.0.0.1 HTTP', async () => {
      const content = `fetch('http://127.0.0.1:3000/api');`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.some(d => d.metadata.ruleId === 'http-url')).toBe(false);
    });
  });

  describe('checkFile - disabled security', () => {
    it('should detect NODE_TLS_REJECT_UNAUTHORIZED disabled', async () => {
      const content = `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('disabled-security');
      expect(diagnoses[0].severity).toBe('critical');
    });
  });

  describe('checkFile - CORS wildcard', () => {
    it('should detect CORS wildcard in header', async () => {
      const content = `'Access-Control-Allow-Origin': '*'`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('cors-wildcard');
    });

    it('should detect CORS wildcard in cors() call', async () => {
      const content = `cors({ origin: '*' })`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses[0].metadata.ruleId).toBe('cors-wildcard');
    });
  });

  describe('checkFile - comments', () => {
    it('should skip issues in single-line comments', async () => {
      const content = `// const password = "test123";`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBe(0);
    });

    it('should skip issues in JSDoc comments', async () => {
      const content = `/**
 * @example const password = "test123";
 */`;
      // @ts-expect-error - accessing private method for testing
      const diagnoses = await skill.checkFile('test.ts', content);
      expect(diagnoses.length).toBe(0);
    });
  });

  describe('getLineNumber', () => {
    it('should return correct line number', () => {
      const content = `line 1
line 2
line 3`;
      // @ts-expect-error - accessing private method for testing
      expect(skill.getLineNumber(content, 0)).toBe(1);
      // @ts-expect-error - accessing private method for testing
      expect(skill.getLineNumber(content, 7)).toBe(2);
      // @ts-expect-error - accessing private method for testing
      expect(skill.getLineNumber(content, 14)).toBe(3);
    });
  });

  describe('diagnose', () => {
    it('should return diagnoses for files with issues', async () => {
      const contextWithIssues = {
        ...mockContext,
        tools: {
          ...mockContext.tools,
          fs: {
            ...mockContext.tools.fs,
            glob: async () => ['test.ts'],
            readFile: async () => `const password = "secret123";`,
          },
        },
      };

      const diagnoses = await skill.diagnose(contextWithIssues);
      expect(diagnoses.length).toBeGreaterThan(0);
    });

    it('should return empty array for clean files', async () => {
      const contextClean = {
        ...mockContext,
        tools: {
          ...mockContext.tools,
          fs: {
            ...mockContext.tools.fs,
            glob: async (pattern: string) => {
              // Only return source files, not config files
              if (pattern.includes('.env') || pattern.includes('config') || pattern.includes('settings')) {
                return [];
              }
              return ['test.ts'];
            },
            readFile: async () => `const greeting = "Hello, World!";`,
          },
        },
      };

      const diagnoses = await skill.diagnose(contextClean);
      expect(diagnoses.length).toBe(0);
    });
  });
});
