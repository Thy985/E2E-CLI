/**
 * E2E Skill Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { E2ESkill } from '../../src/skills/builtin/e2e';
import { SkillContext, Diagnosis, Browser, Page } from '../../src/types';

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

describe('E2ESkill', () => {
  let skill: E2ESkill;
  let mockContext: SkillContext;

  beforeEach(() => {
    skill = new E2ESkill();

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
          readFile: async (path: string) => '',
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
      expect(skill.name).toBe('e2e');
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

  describe('findFragileSelectors', () => {
    it('should detect nth-child selectors', () => {
      const content = `
        await page.locator('div > span:nth-child(2)').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].selector).toContain(':nth-child');
    });

    it('should detect nth-of-type selectors', () => {
      const content = `
        await page.locator('ul > li:nth-of-type(3)').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].selector).toContain(':nth-of-type');
    });

    it('should detect auto-generated ID selectors', () => {
      const content = `
        await page.locator('#a1b2c3d4').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].selector).toBe('#a1b2c3d4');
    });

    it('should detect xpath selectors', () => {
      const content = `
        await page.locator('//div[@class="container"]/span').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].selector).toContain('//');
    });

    it('should detect index-based selectors', () => {
      const content = `
        await page.locator('button').eq(2).click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].selector).toContain('.eq(');
    });

    it('should not flag stable selectors', () => {
      const content = `
        await page.getByRole('button', { name: 'Submit' }).click();
        await page.getByTestId('login-form').fill('test');
        await page.getByText('Welcome').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues.length).toBe(0);
    });

    it('should include line numbers', () => {
      const content = `line 1
line 2
await page.locator('div:nth-child(1)').click();
line 4`;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues[0].line).toBe(3);
    });

    it('should include context for each issue', () => {
      const content = `
        await page.locator('div:nth-child(1)').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const issues = skill.findFragileSelectors(content);
      expect(issues[0].context).toBeDefined();
      expect(issues[0].context).toContain('nth-child');
    });
  });

  describe('extractSelectors', () => {
    it('should extract getByRole selectors', () => {
      const code = `
        await page.getByRole('button').click();
        await page.getByRole('link', { name: 'Home' }).click();
      `;
      // @ts-expect-error - accessing private method for testing
      const selectors = skill.extractSelectors(code);
      expect(selectors).toContain('button');
      expect(selectors).toContain('link');
    });

    it('should extract getByText selectors', () => {
      const code = `
        await page.getByText('Submit').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const selectors = skill.extractSelectors(code);
      expect(selectors).toContain('Submit');
    });

    it('should extract getByTestId selectors', () => {
      const code = `
        await page.getByTestId('login-button').click();
      `;
      // @ts-expect-error - accessing private method for testing
      const selectors = skill.extractSelectors(code);
      expect(selectors).toContain('login-button');
    });

    it('should return unique selectors', () => {
      const code = `
        await page.getByRole('button').click();
        await page.getByRole('button').hover();
      `;
      // @ts-expect-error - accessing private method for testing
      const selectors = skill.extractSelectors(code);
      const buttonCount = selectors.filter(s => s === 'button').length;
      expect(buttonCount).toBe(1);
    });
  });

  describe('getPageName', () => {
    it('should extract page name from path', () => {
      // @ts-expect-error - accessing private method for testing
      expect(skill.getPageName('src/pages/Home.tsx')).toBe('Home');
      // @ts-expect-error - accessing private method for testing
      expect(skill.getPageName('src/pages/user/Profile.tsx')).toBe('user-Profile');
    });
  });

  describe('diagnose', () => {
    it('should detect missing test files', async () => {
      const contextWithNoTests = {
        ...mockContext,
        tools: {
          ...mockContext.tools,
          fs: {
            ...mockContext.tools.fs,
            glob: async () => [],
            exists: async () => false,
          },
        },
      };

      const diagnoses = await skill.diagnose(contextWithNoTests);
      expect(diagnoses.length).toBeGreaterThan(0);
      expect(diagnoses.some(d => d.title.includes('缺少 E2E 测试文件'))).toBe(true);
    });

    it('should detect missing Playwright config', async () => {
      const contextWithTests = {
        ...mockContext,
        tools: {
          ...mockContext.tools,
          fs: {
            ...mockContext.tools.fs,
            glob: async (pattern: string) => {
              if (pattern.includes('spec.ts')) return ['e2e/test.spec.ts'];
              return [];
            },
            exists: async (path: string) => {
              if (path === 'playwright.config.ts') return false;
              return true;
            },
            readFile: async () => 'test content',
          },
        },
      };

      const diagnoses = await skill.diagnose(contextWithTests);
      expect(diagnoses.some(d => d.title.includes('Playwright 配置'))).toBe(true);
    });
  });

  describe('fix', () => {
    it('should generate fix for fragile selector', async () => {
      const diagnosis: Diagnosis = {
        id: 'E2E-test-123',
        skill: 'e2e',
        type: 'functionality',
        severity: 'warning',
        title: '使用脆弱的选择器',
        description: '选择器可能不稳定',
        location: {
          file: 'e2e/test.spec.ts',
          line: 10,
        },
        metadata: {
          selector: 'div:nth-child(2)',
          suggestion: 'getByRole() 或 getByTestId()',
          context: "await page.locator('div:nth-child(2)').click();",
        },
      };

      const contextWithFile = {
        ...mockContext,
        tools: {
          ...mockContext.tools,
          fs: {
            ...mockContext.tools.fs,
            readFile: async () => "await page.locator('div:nth-child(2)').click();",
          },
        },
      };

      const fix = await skill.fix(diagnosis, contextWithFile);
      expect(fix).toBeDefined();
      expect(fix.diagnosisId).toBe('E2E-test-123');
      expect(fix.changes.length).toBeGreaterThan(0);
      expect(fix.autoApplicable).toBe(true);
    });
  });
});
