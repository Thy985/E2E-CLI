/**
 * Config Checker
 * Checks project configuration completeness
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ConfigChecker {
  name = 'config';
  displayName = '配置管理';
  weight = 15;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check .gitignore
    checks.push(await this.checkGitignore(projectPath, logger));

    // Check .env example
    checks.push(await this.checkEnvExample(projectPath, logger));

    // Check editor config
    checks.push(await this.checkEditorConfig(projectPath, logger));

    // Check CI/CD config
    checks.push(await this.checkCICD(projectPath, logger));

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
      description: '配置管理检查包括 .gitignore、环境变量、编辑器配置等',
    };
  }

  private async checkGitignore(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const gitignorePath = path.join(projectPath, '.gitignore');
    
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const patterns = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

      // Check for essential patterns
      const essential = ['node_modules', 'dist', 'build', '.env'];
      const found = essential.filter(p => patterns.some(pattern => pattern.includes(p)));

      const score = Math.round((found.length / essential.length) * 100);

      return {
        id: 'gitignore',
        name: '.gitignore 配置',
        description: '检查 .gitignore 是否包含必要的忽略规则',
        status: score >= 75 ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: `包含 ${found.length}/${essential.length} 个必要规则`,
        fixSuggestion: score < 75 ? '添加 node_modules、dist、.env 等忽略规则' : undefined,
      };
    } catch {
      return {
        id: 'gitignore',
        name: '.gitignore 配置',
        description: '检查 .gitignore 是否存在',
        status: 'fail',
        score: 0,
        maxScore: 100,
        details: '未找到 .gitignore 文件',
        fixSuggestion: '创建 .gitignore 文件并添加必要的忽略规则',
        severity: 'warning',
      };
    }
  }

  private async checkEnvExample(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const envExamplePath = path.join(projectPath, '.env.example');
    
    try {
      const content = await fs.readFile(envExamplePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

      return {
        id: 'env-example',
        name: '环境变量示例',
        description: '检查是否有环境变量示例文件',
        status: 'pass',
        score: 100,
        maxScore: 100,
        details: `存在 .env.example，包含 ${lines.length} 个变量`,
      };
    } catch {
      // Check if .env exists
      try {
        await fs.access(path.join(projectPath, '.env'));
        return {
          id: 'env-example',
          name: '环境变量示例',
          description: '检查是否有环境变量示例文件',
          status: 'warning',
          score: 50,
          maxScore: 100,
          details: '存在 .env 但缺少 .env.example',
          fixSuggestion: '创建 .env.example 文件供团队成员参考',
        };
      } catch {
        return {
          id: 'env-example',
          name: '环境变量示例',
          description: '检查是否有环境变量示例文件',
          status: 'pass',
          score: 80,
          maxScore: 100,
          details: '项目不使用环境变量或未配置',
        };
      }
    }
  }

  private async checkEditorConfig(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const editorConfigPath = path.join(projectPath, '.editorconfig');
    
    try {
      await fs.access(editorConfigPath);
      return {
        id: 'editorconfig',
        name: '编辑器配置',
        description: '检查是否有统一的编辑器配置',
        status: 'pass',
        score: 100,
        maxScore: 100,
        details: '存在 .editorconfig 文件',
      };
    } catch {
      return {
        id: 'editorconfig',
        name: '编辑器配置',
        description: '检查是否有统一的编辑器配置',
        status: 'warning',
        score: 60,
        maxScore: 100,
        details: '未找到 .editorconfig 文件',
        fixSuggestion: '创建 .editorconfig 文件统一代码风格',
      };
    }
  }

  private async checkCICD(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const cicdPaths = [
      '.github/workflows',
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'Jenkinsfile',
      'azure-pipelines.yml',
    ];

    for (const cicdPath of cicdPaths) {
      try {
        const fullPath = path.join(projectPath, cicdPath);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory() || stat.isFile()) {
          return {
            id: 'cicd-config',
            name: 'CI/CD 配置',
            description: '检查是否有 CI/CD 配置',
            status: 'pass',
            score: 100,
            maxScore: 100,
            details: `存在 ${cicdPath}`,
          };
        }
      } catch {
        // Continue checking
      }
    }

    return {
      id: 'cicd-config',
      name: 'CI/CD 配置',
      description: '检查是否有 CI/CD 配置',
      status: 'warning',
      score: 50,
      maxScore: 100,
      details: '未找到 CI/CD 配置',
      fixSuggestion: '配置 GitHub Actions 或其他 CI/CD 工具',
    };
  }
}
