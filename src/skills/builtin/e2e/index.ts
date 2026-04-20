/**
 * E2E Test Skill
 * Generates and runs end-to-end tests using Playwright
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Verification,
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
    projectPath: string,
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
      files.push(...matches.filter(f => !f.includes('node_modules')));
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

  private findFragileSelectors(content: string): { selector: string; line: number; suggestion: string }[] {
    const issues: { selector: string; line: number; suggestion: string }[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check for CSS selectors with nth-child
      const nthMatch = line.match(/['"`]([^'"`]*:nth-child[^'"`]*)['"`]/);
      if (nthMatch) {
        issues.push({
          selector: nthMatch[1],
          line: index + 1,
          suggestion: '使用 data-testid 或 role 选择器替代 nth-child',
        });
      }

      // Check for deep CSS selectors
      const deepMatch = line.match(/['"`]([^'"`]*\s{2,}[^'"`]*)['"`]/);
      if (deepMatch) {
        issues.push({
          selector: deepMatch[1],
          line: index + 1,
          suggestion: '简化选择器，使用更直接的定位方式',
        });
      }

      // Check for ID selectors that might be dynamic
      const idMatch = line.match(/['"`]#([a-f0-9]{8,})['"`]/i);
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
    projectPath: string,
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

    const prompt = `根据以下描述生成 Playwright 测试代码:

描述: ${description}

要求:
1. 使用 TypeScript
2. 使用语义化选择器 (getByRole, getByText, getByTestId)
3. 包含适当的断言
4. 添加清晰的注释

请只输出测试代码，不要其他解释。`;

    const code = await model.chat([
      { role: 'system', content: '你是一个专业的测试工程师，擅长编写 Playwright E2E 测试。' },
      { role: 'user', content: prompt },
    ]);

    // Extract selectors from generated code
    const selectors = this.extractSelectors(code);

    return {
      code,
      description,
      selectors,
    };
  }

  private extractSelectors(code: string): string[] {
    const selectors: string[] = [];
    
    // Extract selectors from getByRole, getByText, getByTestId
    const patterns = [
      /getByRole\(['"`]([^'"`]+)['"`]\)/g,
      /getByText\(['"`]([^'"`]+)['"`]\)/g,
      /getByTestId\(['"`]([^'"`]+)['"`]\)/g,
      /locator\(['"`]([^'"`]+)['"`]\)/g,
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
    const content = await context.tools.fs.readFile(filePath);

    if (diagnosis.metadata?.selector) {
      // Fix fragile selector
      const oldSelector = diagnosis.metadata.selector;
      const suggestion = diagnosis.metadata.suggestion;

      return {
        id: `Fix-${generateId()}`,
        diagnosisId: diagnosis.id,
        description: `修复脆弱选择器: ${oldSelector}`,
        changes: [{
          file: filePath,
          type: 'replace',
          oldContent: oldSelector,
          content: suggestion,
        }],
        riskLevel: 'low',
        autoApplicable: true,
      };
    }

    throw new Error('Cannot fix this diagnosis automatically');
  }
}

// Export default instance
export default E2ESkill;
