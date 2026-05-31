/**
 * Test Checker
 * Checks test coverage and configuration
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TestChecker {
  name = 'test';
  displayName = '测试覆盖';
  weight = 15;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check test framework
    checks.push(await this.checkTestFramework(projectPath, logger));

    // Check test files
    checks.push(await this.checkTestFiles(projectPath, logger));

    // Check coverage
    checks.push(await this.checkCoverage(projectPath, logger));

    // Calculate score
    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);
    const score = Math.round((totalScore / maxScore) * 100);

    const status = score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail';

    return {
      name: this.name,
      displayName: this.displayName,
      score,
      weight: this.weight,
      status,
      checks,
      description: '测试覆盖检查包括测试框架、测试文件、覆盖率等',
    };
  }

  private async checkTestFramework(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const pkgPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      const devDeps = pkg.devDependencies || {};
      const deps = pkg.dependencies || {};
      const allDeps = { ...deps, ...devDeps };

      const testFrameworks = [
        { name: 'jest', displayName: 'Jest' },
        { name: 'vitest', displayName: 'Vitest' },
        { name: 'mocha', displayName: 'Mocha' },
        { name: 'jasmine', displayName: 'Jasmine' },
        { name: '@playwright/test', displayName: 'Playwright' },
        { name: 'cypress', displayName: 'Cypress' },
        { name: '@testing-library/react', displayName: 'Testing Library' },
      ];

      for (const framework of testFrameworks) {
        if (allDeps[framework.name]) {
          return {
            id: 'test-framework',
            name: '测试框架',
            description: '检查是否配置了测试框架',
            status: 'pass',
            score: 100,
            maxScore: 100,
            details: `使用 ${framework.displayName}`,
          };
        }
      }

      return {
        id: 'test-framework',
        name: '测试框架',
        description: '检查是否配置了测试框架',
        status: 'warning',
        score: 30,
        maxScore: 100,
        details: '未找到测试框架',
        fixSuggestion: '安装 Jest 或 Vitest 等测试框架',
      };
    } catch {
      return {
        id: 'test-framework',
        name: '测试框架',
        description: '检查测试框架配置',
        status: 'fail',
        score: 0,
        maxScore: 100,
        details: '无法读取 package.json',
      };
    }
  }

  private async checkTestFiles(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const testPatterns = [
      '__tests__',
      'test',
      'tests',
      'spec',
      'specs',
    ];

    let testFileCount = 0;
    const foundDirs: string[] = [];

    // Check for test directories
    for (const pattern of testPatterns) {
      try {
        const testDir = path.join(projectPath, pattern);
        const stat = await fs.stat(testDir);
        if (stat.isDirectory()) {
          foundDirs.push(pattern);
          const files = await this.getTestFiles(testDir);
          testFileCount += files.length;
        }
      } catch {
        // Directory not found
      }
    }

    // Check for .test.ts and .spec.ts files in src
    try {
      const srcPath = path.join(projectPath, 'src');
      const srcFiles = await this.getAllFiles(srcPath);
      testFileCount += srcFiles.filter(f => 
        f.endsWith('.test.ts') || f.endsWith('.test.tsx') ||
        f.endsWith('.spec.ts') || f.endsWith('.spec.tsx')
      ).length;
    } catch {
      // src not found
    }

    const score = testFileCount > 0 ? Math.min(100, testFileCount * 20) : 0;

    return {
      id: 'test-files',
      name: '测试文件',
      description: '检查是否有测试文件',
      status: testFileCount > 0 ? 'pass' : 'warning',
      score,
      maxScore: 100,
      details: testFileCount > 0 
        ? `找到 ${testFileCount} 个测试文件`
        : '未找到测试文件',
      fixSuggestion: testFileCount === 0 ? '创建测试文件并编写测试用例' : undefined,
    };
  }

  private async checkCoverage(projectPath: string, logger: Logger): Promise<AuditCheck> {
    // Check for coverage configuration
    const pkgPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);

      // Check for coverage scripts
      const scripts = pkg.scripts || {};
      const hasCoverageScript = Object.values(scripts).some(
        script => typeof script === 'string' && script.includes('coverage')
      );

      // Check for coverage threshold config
      const hasThreshold = pkg.jest?.coverageThreshold || 
                          pkg.vitest?.coverage?.threshold;

      let score = 50;
      if (hasCoverageScript) score += 25;
      if (hasThreshold) score += 25;

      // Check for existing coverage report
      const coveragePath = path.join(projectPath, 'coverage', 'coverage-summary.json');
      try {
        const coverageContent = await fs.readFile(coveragePath, 'utf-8');
        const coverage = JSON.parse(coverageContent);
        const lineCoverage = coverage.total?.lines?.pct || 0;
        
        if (lineCoverage >= 80) score = 100;
        else if (lineCoverage >= 60) score = 80;
        else if (lineCoverage >= 40) score = 60;
        else score = 40;

        return {
          id: 'test-coverage',
          name: '测试覆盖率',
          description: '检查测试覆盖率',
          status: lineCoverage >= 60 ? 'pass' : 'warning',
          score,
          maxScore: 100,
          details: `行覆盖率: ${lineCoverage.toFixed(1)}%`,
          fixSuggestion: lineCoverage < 60 ? '增加测试用例提高覆盖率' : undefined,
        };
      } catch {
        // No coverage report
      }

      return {
        id: 'test-coverage',
        name: '测试覆盖率',
        description: '检查测试覆盖率配置',
        status: hasCoverageScript ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: hasCoverageScript 
          ? '已配置覆盖率脚本'
          : '未配置覆盖率脚本',
        fixSuggestion: '添加 test:coverage 脚本并运行覆盖率报告',
      };
    } catch {
      return {
        id: 'test-coverage',
        name: '测试覆盖率',
        description: '检查测试覆盖率',
        status: 'warning',
        score: 50,
        maxScore: 100,
        details: '无法检查覆盖率',
      };
    }
  }

  private async getTestFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.getTestFiles(fullPath));
        } else if (entry.isFile() && (
          entry.name.endsWith('.test.ts') ||
          entry.name.endsWith('.test.tsx') ||
          entry.name.endsWith('.spec.ts') ||
          entry.name.endsWith('.spec.tsx') ||
          entry.name.endsWith('.test.js') ||
          entry.name.endsWith('.spec.js')
        )) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.getAllFiles(fullPath));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }
}
