/**
 * Code Quality Checker
 * Checks code quality metrics
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CodeQualityChecker {
  name = 'code-quality';
  displayName = '代码质量';
  weight = 20;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check TypeScript configuration
    checks.push(await this.checkTypeScript(projectPath, logger));

    // Check ESLint configuration
    checks.push(await this.checkESLint(projectPath, logger));

    // Check code structure
    checks.push(await this.checkCodeStructure(projectPath, logger));

    // Check for common issues
    checks.push(await this.checkCommonIssues(projectPath, logger));

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
      description: '代码质量检查包括 TypeScript 配置、ESLint 配置、代码结构等',
    };
  }

  private async checkTypeScript(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    
    try {
      await fs.access(tsconfigPath);
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);

      // Check for strict mode
      const hasStrict = config.compilerOptions?.strict === true;
      const hasNoImplicitAny = config.compilerOptions?.noImplicitAny !== false;

      let score = 50;
      if (hasStrict) score += 30;
      if (hasNoImplicitAny) score += 20;

      return {
        id: 'typescript-config',
        name: 'TypeScript 配置',
        description: '检查 TypeScript 配置是否完善',
        status: score >= 80 ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: hasStrict ? '已启用 strict 模式' : '建议启用 strict 模式',
        fixSuggestion: hasStrict ? undefined : '在 tsconfig.json 中设置 "strict": true',
      };
    } catch {
      return {
        id: 'typescript-config',
        name: 'TypeScript 配置',
        description: '检查 TypeScript 配置是否完善',
        status: 'fail',
        score: 0,
        maxScore: 100,
        details: '未找到 tsconfig.json',
        fixSuggestion: '运行 tsc --init 创建 TypeScript 配置',
        severity: 'warning',
      };
    }
  }

  private async checkESLint(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const eslintFiles = [
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      'eslint.config.js',
    ];

    let found = false;
    for (const file of eslintFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        found = true;
        break;
      } catch {
        // Continue checking
      }
    }

    // Also check package.json for eslint config
    if (!found) {
      try {
        const pkgPath = path.join(projectPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        if (pkg.eslintConfig) found = true;
      } catch {
        // Ignore
      }
    }

    return {
      id: 'eslint-config',
      name: 'ESLint 配置',
      description: '检查 ESLint 配置是否存在',
      status: found ? 'pass' : 'warning',
      score: found ? 100 : 30,
      maxScore: 100,
      details: found ? '已配置 ESLint' : '未找到 ESLint 配置',
      fixSuggestion: found ? undefined : '运行 npm init @eslint/config 初始化 ESLint',
    };
  }

  private async checkCodeStructure(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const srcPath = path.join(projectPath, 'src');
    let score = 0;
    const details: string[] = [];

    try {
      const entries = await fs.readdir(srcPath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const files = entries.filter(e => e.isFile()).map(e => e.name);

      // Check for common structure patterns
      if (dirs.includes('components')) {
        score += 20;
        details.push('有 components 目录');
      }
      if (dirs.includes('utils') || dirs.includes('lib')) {
        score += 20;
        details.push('有 utils/lib 目录');
      }
      if (dirs.includes('types') || files.some(f => f.includes('.d.ts'))) {
        score += 20;
        details.push('有类型定义');
      }
      if (dirs.includes('services') || dirs.includes('api')) {
        score += 20;
        details.push('有 services/api 目录');
      }
      if (files.includes('index.ts') || files.includes('index.js')) {
        score += 20;
        details.push('有入口文件');
      }
    } catch {
      details.push('未找到 src 目录');
    }

    return {
      id: 'code-structure',
      name: '代码结构',
      description: '检查代码目录结构是否合理',
      status: score >= 60 ? 'pass' : 'warning',
      score,
      maxScore: 100,
      details: details.join('、'),
    };
  }

  private async checkCommonIssues(projectPath: string, logger: Logger): Promise<AuditCheck> {
    let score = 100;
    const issues: string[] = [];

    // Check for console.log statements
    try {
      const srcPath = path.join(projectPath, 'src');
      const files = await this.getAllFiles(srcPath);
      
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx') && 
            !file.endsWith('.js') && !file.endsWith('.jsx')) {
          continue;
        }

        try {
          const content = await fs.readFile(file, 'utf-8');
          const consoleMatches = content.match(/console\.(log|debug|info)/g);
          if (consoleMatches && consoleMatches.length > 0) {
            score -= 5;
            issues.push(`${path.basename(file)} 有 ${consoleMatches.length} 个 console.log`);
          }
        } catch {
          // Ignore file read errors
        }
      }
    } catch {
      // src directory not found
    }

    score = Math.max(0, score);

    return {
      id: 'common-issues',
      name: '常见问题',
      description: '检查代码中的常见问题',
      status: score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail',
      score,
      maxScore: 100,
      details: issues.length > 0 ? issues.slice(0, 3).join('、') : '未发现常见问题',
      fixSuggestion: issues.length > 0 ? '移除 console.log 语句' : undefined,
    };
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
