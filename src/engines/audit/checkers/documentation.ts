/**
 * Documentation Checker
 * Checks documentation completeness
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class DocumentationChecker {
  name = 'documentation';
  displayName = '文档完整性';
  weight = 10;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check README
    checks.push(await this.checkReadme(projectPath, logger));

    // Check CHANGELOG
    checks.push(await this.checkChangelog(projectPath, logger));

    // Check CONTRIBUTING
    checks.push(await this.checkContributing(projectPath, logger));

    // Check API docs
    checks.push(await this.checkApiDocs(projectPath, logger));

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
      description: '文档完整性检查包括 README、CHANGELOG、贡献指南等',
    };
  }

  private async checkReadme(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const readmeFiles = ['README.md', 'README.txt', 'readme.md'];
    
    for (const file of readmeFiles) {
      try {
        const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
        
        // Check for essential sections
        const hasTitle = /^#\s/.test(content);
        const hasInstall = /安装|install|Install/i.test(content);
        const hasUsage = /使用|用法|usage|Usage/i.test(content);
        
        let score = 50;
        if (hasTitle) score += 15;
        if (hasInstall) score += 20;
        if (hasUsage) score += 15;

        return {
          id: 'readme',
          name: 'README 文档',
          description: '检查 README 文档是否完整',
          status: score >= 80 ? 'pass' : 'warning',
          score,
          maxScore: 100,
          details: `存在 ${file}，${hasTitle ? '有标题' : '缺少标题'}，${hasInstall ? '有安装说明' : '缺少安装说明'}`,
          fixSuggestion: score < 80 ? '完善 README 文档，添加安装和使用说明' : undefined,
        };
      } catch {
        // Continue checking
      }
    }

    return {
      id: 'readme',
      name: 'README 文档',
      description: '检查 README 文档是否存在',
      status: 'fail',
      score: 0,
      maxScore: 100,
      details: '未找到 README 文件',
      fixSuggestion: '创建 README.md 文件，包含项目介绍、安装和使用说明',
      severity: 'warning',
    };
  }

  private async checkChangelog(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const changelogFiles = ['CHANGELOG.md', 'HISTORY.md', 'CHANGES.md'];
    
    for (const file of changelogFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        return {
          id: 'changelog',
          name: 'CHANGELOG 文档',
          description: '检查是否有变更日志',
          status: 'pass',
          score: 100,
          maxScore: 100,
          details: `存在 ${file}`,
        };
      } catch {
        // Continue checking
      }
    }

    return {
      id: 'changelog',
      name: 'CHANGELOG 文档',
      description: '检查是否有变更日志',
      status: 'warning',
      score: 50,
      maxScore: 100,
      details: '未找到 CHANGELOG 文件',
      fixSuggestion: '创建 CHANGELOG.md 记录版本变更',
    };
  }

  private async checkContributing(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const contributingFiles = ['CONTRIBUTING.md', 'CONTRIBUTE.md'];
    
    for (const file of contributingFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        return {
          id: 'contributing',
          name: '贡献指南',
          description: '检查是否有贡献指南',
          status: 'pass',
          score: 100,
          maxScore: 100,
          details: `存在 ${file}`,
        };
      } catch {
        // Continue checking
      }
    }

    return {
      id: 'contributing',
      name: '贡献指南',
      description: '检查是否有贡献指南',
      status: 'warning',
      score: 50,
      maxScore: 100,
      details: '未找到贡献指南',
      fixSuggestion: '创建 CONTRIBUTING.md 说明如何贡献代码',
    };
  }

  private async checkApiDocs(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const docsPath = path.join(projectPath, 'docs');
    
    try {
      const stat = await fs.stat(docsPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(docsPath);
        const docFiles = files.filter(f => 
          f.endsWith('.md') || f.endsWith('.mdx') || f.endsWith('.rst')
        );

        return {
          id: 'api-docs',
          name: 'API 文档',
          description: '检查是否有 API 文档',
          status: 'pass',
          score: 100,
          maxScore: 100,
          details: `docs 目录包含 ${docFiles.length} 个文档文件`,
        };
      }
    } catch {
      // docs directory not found
    }

    // Check for inline documentation
    try {
      const srcPath = path.join(projectPath, 'src');
      const files = await this.getTsFiles(srcPath);
      
      let documentedFiles = 0;
      for (const file of files.slice(0, 10)) { // Check first 10 files
        const content = await fs.readFile(file, 'utf-8');
        if (content.includes('/**') || content.includes('* @')) {
          documentedFiles++;
        }
      }

      const score = files.length > 0 ? Math.round((documentedFiles / Math.min(files.length, 10)) * 100) : 80;

      return {
        id: 'api-docs',
        name: 'API 文档',
        description: '检查代码注释和文档',
        status: score >= 60 ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: files.length > 0 
          ? `${documentedFiles}/${Math.min(files.length, 10)} 个文件有 JSDoc 注释`
          : '未找到源代码文件',
      };
    } catch {
      return {
        id: 'api-docs',
        name: 'API 文档',
        description: '检查 API 文档',
        status: 'warning',
        score: 60,
        maxScore: 100,
        details: '未找到文档目录或源代码',
      };
    }
  }

  private async getTsFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.getTsFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }
}
