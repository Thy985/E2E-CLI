/**
 * Dependency Checker
 * Checks dependency security and health
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DependencyChecker {
  name = 'dependency';
  displayName = '依赖管理';
  weight = 20;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check package.json
    checks.push(await this.checkPackageJson(projectPath, logger));

    // Check for outdated dependencies
    checks.push(await this.checkOutdated(projectPath, logger));

    // Check for security vulnerabilities
    checks.push(await this.checkSecurity(projectPath, logger));

    // Check lock file
    checks.push(await this.checkLockFile(projectPath, logger));

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
      description: '依赖管理检查包括版本管理、安全漏洞、锁文件等',
    };
  }

  private async checkPackageJson(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const pkgPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);

      let score = 40;
      const details: string[] = [];

      // Check for required fields
      if (pkg.name) { score += 10; details.push('有 name'); }
      if (pkg.version) { score += 10; details.push('有 version'); }
      if (pkg.description) { score += 10; details.push('有 description'); }
      if (pkg.license) { score += 10; details.push('有 license'); }
      if (pkg.repository || pkg.homepage) { score += 10; details.push('有 repository'); }
      if (pkg.author) { score += 10; details.push('有 author'); }

      return {
        id: 'package-json',
        name: 'package.json 配置',
        description: '检查 package.json 是否配置完整',
        status: score >= 80 ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: details.join('、'),
        fixSuggestion: score < 80 ? '完善 package.json 中的元信息' : undefined,
      };
    } catch {
      return {
        id: 'package-json',
        name: 'package.json 配置',
        description: '检查 package.json 是否存在',
        status: 'fail',
        score: 0,
        maxScore: 100,
        details: '未找到 package.json',
        severity: 'critical',
      };
    }
  }

  private async checkOutdated(projectPath: string, logger: Logger): Promise<AuditCheck> {
    try {
      // Try to run npm outdated
      const { stdout } = await execAsync('npm outdated --json', {
        cwd: projectPath,
        timeout: 30000,
      }).catch(() => ({ stdout: '{}' }));

      const outdated = JSON.parse(stdout || '{}');
      const outdatedCount = Object.keys(outdated).length;

      let score = 100;
      if (outdatedCount > 10) score = 50;
      else if (outdatedCount > 5) score = 70;
      else if (outdatedCount > 0) score = 85;

      return {
        id: 'outdated-deps',
        name: '依赖更新',
        description: '检查是否有过多过时的依赖',
        status: outdatedCount === 0 ? 'pass' : outdatedCount > 5 ? 'warning' : 'pass',
        score,
        maxScore: 100,
        details: outdatedCount === 0 ? '所有依赖都是最新版本' : `有 ${outdatedCount} 个依赖需要更新`,
        fixSuggestion: outdatedCount > 0 ? '运行 npm update 更新依赖' : undefined,
      };
    } catch {
      return {
        id: 'outdated-deps',
        name: '依赖更新',
        description: '检查依赖更新状态',
        status: 'skip',
        score: 80,
        maxScore: 100,
        details: '无法检查依赖更新状态',
      };
    }
  }

  private async checkSecurity(projectPath: string, logger: Logger): Promise<AuditCheck> {
    try {
      // Try to run npm audit
      const { stdout } = await execAsync('npm audit --json', {
        cwd: projectPath,
        timeout: 60000,
      }).catch((e) => ({ stdout: e.stdout || '{}' }));

      const audit = JSON.parse(stdout || '{}');
      const vulnerabilities = audit.metadata?.vulnerabilities || {};
      
      const critical = vulnerabilities.critical || 0;
      const high = vulnerabilities.high || 0;
      const moderate = vulnerabilities.moderate || 0;
      const total = critical + high + moderate;

      let score = 100;
      if (critical > 0) score = 20;
      else if (high > 0) score = 50;
      else if (moderate > 0) score = 70;

      const status = critical > 0 ? 'fail' : high > 0 ? 'warning' : 'pass';

      return {
        id: 'security-audit',
        name: '安全漏洞',
        description: '检查依赖中的安全漏洞',
        status,
        score,
        maxScore: 100,
        details: total === 0 ? '未发现安全漏洞' : `发现 ${critical} 个严重、${high} 个高危、${moderate} 个中危漏洞`,
        fixSuggestion: total > 0 ? '运行 npm audit fix 修复漏洞' : undefined,
        severity: critical > 0 ? 'critical' : high > 0 ? 'warning' : undefined,
      };
    } catch {
      return {
        id: 'security-audit',
        name: '安全漏洞',
        description: '检查依赖安全漏洞',
        status: 'skip',
        score: 80,
        maxScore: 100,
        details: '无法运行安全审计',
      };
    }
  }

  private async checkLockFile(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const lockFiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
    
    for (const file of lockFiles) {
      try {
        await fs.access(path.join(projectPath, file));
        return {
          id: 'lock-file',
          name: '锁文件',
          description: '检查是否存在依赖锁文件',
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
      id: 'lock-file',
      name: '锁文件',
      description: '检查是否存在依赖锁文件',
      status: 'warning',
      score: 50,
      maxScore: 100,
      details: '未找到锁文件',
      fixSuggestion: '运行 npm install 生成锁文件',
    };
  }
}
