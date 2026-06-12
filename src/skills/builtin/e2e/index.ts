/**
 * E2E Test Skill
 * Generates and runs end-to-end tests using Playwright
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  DiagnosisType,
  Severity,
} from '../../../types';
import { generateId } from '../../../utils';

export interface TestGenerationResult {
  code: string;
  description: string;
  selectors: string[];
}

export class E2ESkill extends BaseSkill {
  name = 'e2e';
  version = '1.0.0';
  description = 'E2E 端到端测试';

  triggers = [
    { type: 'command' as const, pattern: 'e2e' },
    { type: 'keyword' as const, pattern: /测试|test|e2e|end-to-end/i },
  ];

  capabilities = [
    {
      name: 'test-generation',
      description: '从自然语言生成测试用例',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'test-execution',
      description: '执行测试并分析结果',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'selector-healing',
      description: '自动修复失效的选择器',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('开始 E2E 测试检查...');

    // Check for existing test files
    const testFiles = await this.getTestFiles(project.path, tools);
    logger.debug(`找到 ${testFiles.length} 个测试文件`);

    // Check test coverage
    const coverageIssues = await this.checkTestCoverage(project.path, testFiles, tools);
    diagnoses.push(...coverageIssues);

    // Check for broken selectors in existing tests
    const selectorIssues = await this.checkSelectors(testFiles, tools);
    diagnoses.push(...selectorIssues);

    // Check for missing critical tests
    const missingTests = await this.checkMissingTests(project.path, tools);
    diagnoses.push(...missingTests);

    logger.info(`E2E 测试检查完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getTestFiles(
    _projectPath: string,
    tools: SkillContext['tools']
  ): Promise<string[]> {
    const patterns = [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.spec.js',
      '**/*.test.js',
      '**/e2e/**/*.ts',
      '**/tests/**/*.ts',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      // Exclude node_modules and qa-agent's own source code
      files.push(...matches.filter(f =>
        !f.includes('node_modules') &&
        !f.includes('src/skills') &&
        !f.includes('src/engines')
      ));
    }
    return [...new Set(files)];
  }

  private async checkTestCoverage(
    projectPath: string,
    testFiles: string[],
    tools: SkillContext['tools']
  ): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check if there are any test files
    if (testFiles.length === 0) {
      diagnoses.push({
        id: `E2E-${generateId()}`,
        skill: this.name,
        type: 'functionality' as DiagnosisType,
        severity: 'warning' as Severity,
        title: '缺少 E2E 测试文件',
        description: '项目没有 E2E 测试文件，建议添加测试覆盖关键功能',
        location: {
          file: projectPath,
        },
        fixSuggestion: {
          description: '创建 e2e 目录并添加测试文件',
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    // Check for Playwright config
    const playwrightConfig = await tools.fs.exists('playwright.config.ts');
    if (!playwrightConfig) {
      diagnoses.push({
        id: `E2E-${generateId()}`,
        skill: this.name,
        type: 'functionality' as DiagnosisType,
        severity: 'info' as Severity,
        title: '缺少 Playwright 配置',
        description: '建议添加 playwright.config.ts 配置文件',
        location: {
          file: projectPath,
        },
        fixSuggestion: {
          description: '运行 npx playwright install 初始化配置',
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    return diagnoses;
  }

  private async checkSelectors(
    testFiles: string[],
    tools: SkillContext['tools']
  ): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    for (const file of testFiles) {
      const content = await tools.fs.readFile(file);
      
      // Check for fragile selectors
      const fragileSelectors = this.findFragileSelectors(content);
      
      for (const selector of fragileSelectors) {
        diagnoses.push({
          id: `E2E-${generateId()}`,
          skill: this.name,
          type: 'functionality' as DiagnosisType,
          severity: 'warning' as Severity,
          title: '使用脆弱的选择器',
          description: `选择器 "${selector.selector}" 可能不稳定，建议使用语义化选择器`,
          location: {
            file,
            line: selector.line,
          },
          metadata: {
            selector: selector.selector,
            suggestion: selector.suggestion,
          },
          fixSuggestion: {
            description: selector.suggestion,
            autoApplicable: true,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  /**
   * 扫描脆弱的 E2E 选择器。
   * 关键修复：
   * 1. 跳过单行注释（//）与块注释（/* ... *\/），避免误报
   * 2. "深度选择器" 改用 descendant combinator 形式（必须真的像选择器）
   * 3. ID 启发式只在 6~32 位十六进制内才视为动态 ID，避免误伤短 ID
   */
  private findFragileSelectors(content: string): { selector: string; line: number; suggestion: string }[] {
    const issues: { selector: string; line: number; suggestion: string }[] = [];
    const lines = content.split('\n');

    let inBlockComment = false;
    lines.forEach((line, index) => {
      const cleaned = stripComments(line, inBlockComment);
      inBlockComment = trackBlockComment(cleaned, inBlockComment);
      if (!cleaned.trim()) return;

      const nthMatch = cleaned.match(/['"`]([^'"`]*:nth-(?:child|of-type)[^'"`]*)['"`]/);
      if (nthMatch) {
        issues.push({
          selector: nthMatch[1],
          line: index + 1,
          suggestion: '使用 data-testid 或 role 选择器替代 nth-child/nth-of-type',
        });
      }

      const xpathMatch = cleaned.match(/['"`](\/\/[^'"`]+|\/[a-zA-Z][^'"`]*)['"`]/);
      if (xpathMatch && /^\/{1,2}[a-zA-Z[\]]/.test(xpathMatch[1])) {
        issues.push({
          selector: xpathMatch[1],
          line: index + 1,
          suggestion: 'Use getByRole() or getByText() instead of xpath',
        });
      }

      const indexMatch = cleaned.match(/\.(?:eq|nth)\((\d+)\)/);
      if (indexMatch) {
        issues.push({
          selector: `.${indexMatch[0].split('(')[0]}(${indexMatch[1]})`,
          line: index + 1,
          suggestion: 'Use getByRole() or data-testid instead of index-based selection',
        });
      }

      const deepMatch = cleaned.match(/['"`]([^'"`]*[\s>+~]+[#.[]a-zA-Z\d_-?[^'"`]*)['"`]/);
      if (deepMatch && /[\s>+~]/.test(deepMatch[1]) && /[#.[]/.test(deepMatch[1])) {
        issues.push({
          selector: deepMatch[1],
          line: index + 1,
          suggestion: '简化选择器，使用更直接的定位方式',
        });
      }

      const idMatch = cleaned.match(/['"`]#([a-f0-9]{6,32})['"`]/i);
      if (idMatch) {
        issues.push({
          selector: `#${idMatch[1]}`,
          line: index + 1,
          suggestion: 'ID 看起来是动态生成的，使用 data-testid 替代',
        });
      }
    });

    return issues;
  }

  private async checkMissingTests(
    _projectPath: string,
    tools: SkillContext['tools']
  ): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check for common pages that should have tests
    const pageFiles = await tools.fs.glob('src/pages/**/*.tsx');
    
    for (const pageFile of pageFiles.slice(0, 10)) { // Limit to first 10
      const pageName = this.getPageName(pageFile);
      const testFile = `e2e/${pageName}.spec.ts`;
      
      const hasTest = await tools.fs.exists(testFile);
      if (!hasTest) {
        diagnoses.push({
          id: `E2E-${generateId()}`,
          skill: this.name,
          type: 'functionality' as DiagnosisType,
          severity: 'info' as Severity,
          title: `页面 ${pageName} 缺少测试`,
          description: `建议为页面 ${pageName} 添加 E2E 测试`,
          location: {
            file: pageFile,
          },
          fixSuggestion: {
            description: `创建 ${testFile} 测试文件`,
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private getPageName(filePath: string): string {
    const match = filePath.match(/\/pages\/(.+?)\.tsx$/);
    return match ? match[1].replace(/\//g, '-') : 'unknown';
  }

  /**
   * Generate test from natural language description
   */
  async generateTest(
    description: string,
    context: SkillContext
  ): Promise<TestGenerationResult> {
    const { model, logger } = context;

    logger.info(`生成测试: ${description}`);

    // Mock fallback：没有真实 API key 时返回的 model，
    // 调 LLM 只会得到无意义的占位文本。改用 keyword-driven 模板
    // 引擎，仍能产出可用的 Playwright 骨架。
    if (model.isMock) {
      logger.debug('检测到 mock model client，使用 template fallback 生成测试');
      return this.generateTestFromTemplate(description);
    }

    const prompt = `根据以下描述生成 Playwright 测试代码:

描述: ${description}

要求:
1. 使用 TypeScript
2. 使用语义化选择器 (getByRole, getByText, getByTestId)
3. 包含适当的断言
4. 添加清晰的注释

请只输出测试代码，不要其他解释。`;

    const response = await model.chat([
      { role: 'system', content: '你是一个专业的测试工程师，擅长编写 Playwright E2E 测试。' },
      { role: 'user', content: prompt },
    ]);
    const code = response.content;

    // Extract selectors from generated code
    const selectors = this.extractSelectors(code);

    return {
      code,
      description,
      selectors,
    };
  }

  /**
   * Template-based Playwright test generator (mock-mode fallback).
   *
   * 当 LLM 不可用时（mock client），用 keyword 解析 description
   * 并拼装可用的 Playwright 骨架。覆盖常见场景：
   * - 导航（navigate/visit/open/go to）
   * - 点击（click/press/tap）
   * - 输入（fill/type/input/enter）
   * - 断言（verify/check/assert/should）
   * - title 检查
   *
   * 真实 LLM 仍能产生更复杂、更智能的代码；此模板仅保证
   * "无 key 时也有可用的脚手架"。
   */
  private generateTestFromTemplate(description: string): TestGenerationResult {
    const desc = description.trim();
    const lower = desc.toLowerCase();

    // 关键字检测
    const wantsNavigate = /navigate|visit|open|go\s*to|访问|打开|进入/.test(lower);
    const wantsClick = /click|press|tap|点击/.test(lower);
    const wantsFill = /fill|type|input|enter|输入/.test(lower);
    const wantsCheckTitle = /title|标题/.test(lower);
    const wantsAssert = /verify|check|assert|should|expect|验证|断言|应该/.test(lower);

    // 抽取 URL（http(s)://... 或 "/" 开头）
    const urlMatch = desc.match(/https?:\/\/[^\s]+/) ?? desc.match(/\/[\w\-\/\.]+/);
    const url = urlMatch ? urlMatch[0] : '/';

    // 抽取 role/name 形式：'button "Login"' / 'button with text "Login"'
    const buttonMatch = desc.match(/button(?:\s+(?:with\s+text\s+)?|["'`])?["'`]([^"'`]+)["'`]/i)
      ?? desc.match(/按钮[「"\s]*([^」"\s]+)/);
    const buttonName = buttonMatch?.[1];

    const inputMatch = desc.match(/input(?:\s+(?:with\s+(?:label|placeholder)\s+)?|["'`])?["'`]([^"'`]+)["'`]/i)
      ?? desc.match(/输入框?[「"\s]*([^」"\s]+)/);
    const inputName = inputMatch?.[1];

    // 抽取期望的 title
    const titleMatch = desc.match(/title(?:\s+(?:is|=|为|是))?\s*["'`]([^"'`]+)["'`]/i)
      ?? desc.match(/标题[是为]?\s*["']([^"']+)["']/);
    const expectedTitle = titleMatch?.[1];

    // 拼装 Playwright 代码
    const steps: string[] = [];
    if (wantsNavigate) {
      steps.push(`  // 1. 导航到目标页面`);
      steps.push(`  await page.goto('${url}');`);
    }
    if (wantsFill && inputName) {
      steps.push(`  // 2. 在输入框中输入内容`);
      steps.push(`  await page.getByLabel('${inputName}').fill('test-value');`);
    }
    if (wantsClick && buttonName) {
      steps.push(`  // 3. 点击按钮`);
      steps.push(`  await page.getByRole('button', { name: '${buttonName}' }).click();`);
    }
    if (wantsCheckTitle && expectedTitle) {
      steps.push(`  // 4. 验证页面 title`);
      steps.push(`  await expect(page).toHaveTitle('${expectedTitle}');`);
    } else if (wantsAssert) {
      // 通用兜底断言
      steps.push(`  // 4. 通用断言：页面已加载`);
      steps.push(`  await expect(page).toHaveURL(/.*/);`);
    }

    // 如果什么都没识别出来，生成一个最小可跑的骨架
    if (steps.length === 0) {
      steps.push(`  await page.goto('${url}');`);
      steps.push(`  await expect(page.locator('body')).toBeVisible();`);
    }

    const code = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('${desc.replace(/'/g, "\\'")}', async ({ page }) => {`,
      ...steps,
      `});`,
      ``,
    ].join('\n');

    const selectors = this.extractSelectors(code);

    return {
      code,
      description,
      selectors,
    };
  }

  private extractSelectors(code: string): string[] {
    const selectors: string[] = [];

    // Extract selectors from getByRole, getByText, getByTestId, locator
    // 支持两种形式：
    //   1) getByRole('button')                   → 'button'
    //   2) getByRole('button', { name: 'Login' }) → 'button', 'Login'
    // 形式 2 用两个独立 regex 提取：
    //   - 第一个参数（role 字符串）
    //   - name / label / text / testId 等 object 字段
    const patterns: RegExp[] = [
      /getByRole\(\s*['"`]([^'"`]+)['"`]/g,
      /getByText\(\s*['"`]([^'"`]+)['"`]/g,
      /getByTestId\(\s*['"`]([^'"`]+)['"`]/g,
      /locator\(\s*['"`]([^'"`]+)['"`]/g,
      // 提取 getByRole / getByLabel 的 name / label 字段值
      /\{\s*name\s*:\s*['"`]([^'"`]+)['"`]/g,
      /\{\s*label\s*:\s*['"`]([^'"`]+)['"`]/g,
      /\{\s*text\s*:\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of patterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        selectors.push(match[1]);
      }
    }

    return [...new Set(selectors)];
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const filePath = diagnosis.location.file;
    const oldSelector = diagnosis.metadata?.selector;
    const suggestion = diagnosis.metadata?.suggestion;

    // 自我修复脆弱选择器会破坏原有测试逻辑（不知道真实 DOM 结构），
    // 改用一个保守的占位符：保留选择器字面量，在后面追加 `data-testid` 提示注释，
    // 至少让"修复"动作可见、可回滚，并强制要求人工 review。
    if (oldSelector) {
      const content = await context.tools.fs.readFile(filePath);
      const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(['"\`])${escaped}\\1`);
      if (!pattern.test(content)) {
        throw new Error(`Cannot locate selector "${oldSelector}" in ${filePath} — file may have been modified.`);
      }

      const replacement = `$1${oldSelector}$1 /* TODO(qa-agent): ${suggestion ?? 'replace with stable selector'} */`;

      return {
        id: `Fix-${generateId()}`,
        diagnosisId: diagnosis.id,
        description: `为脆弱选择器 ${oldSelector} 添加 TODO 标记，需要人工重构`,
        changes: [{
          file: filePath,
          type: 'replace',
          oldContent: oldSelector,
          content: replacement,
        }],
        riskLevel: 'low',
        autoApplicable: false,
        notes: '修复仅添加 TODO 注释，未真正替换选择器。请人工 review 并改写为稳定的 data-testid / role 选择器。',
      };
    }

    throw new Error('Cannot fix this diagnosis automatically');
  }
}

// ============================================
// 模块级辅助
// ============================================

/**
 * 去掉单行注释（//）与块注释（/* ... *\/），
 * 同时保留字符串字面量。粗略但对常规 TS/JS 代码足够。
 */
function stripComments(line: string, inBlockComment: boolean): string {
  let result = '';
  let i = 0;

  while (i < line.length) {
    if (inBlockComment) {
      const end = line.indexOf('*/', i);
      if (end === -1) return result;
      i = end + 2;
      inBlockComment = false;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (two === '//') {
      // 后面整行都是注释，丢弃
      return result;
    }
    if (two === '/*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    // 跳过字符串字面量
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      result += ch;
      i++;
      while (i < line.length && line[i] !== ch) {
        if (line[i] === '\\') {
          result += line[i] + (line[i + 1] ?? '');
          i += 2;
        } else {
          result += line[i];
          i++;
        }
      }
      if (i < line.length) {
        result += line[i];
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }

  return result;
}

function trackBlockComment(cleaned: string, previous: boolean): boolean {
  // 进入块注释但未在同一行闭合
  if (previous) return /\*\//.test(cleaned) ? false : true;
  // 不在本函数里判断 //，stripComments 已经处理
  return /\/\*/.test(cleaned) && !/\*\//.test(cleaned.slice(cleaned.indexOf('/*') + 2));
}

// Export default instance
export default E2ESkill;
