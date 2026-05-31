/**
 * Security Checker
 * Checks security best practices
 */

import { AuditCategory, AuditCheck } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SecurityChecker {
  name = 'security';
  displayName = '安全实践';
  weight = 20;

  async check(projectPath: string, logger: Logger): Promise<AuditCategory> {
    const checks: AuditCheck[] = [];

    // Check .env is not committed
    checks.push(await this.checkEnvNotCommitted(projectPath, logger));

    // Check for secrets in code
    checks.push(await this.checkSecretsInCode(projectPath, logger));

    // Check for security headers
    checks.push(await this.checkSecurityHeaders(projectPath, logger));

    // Check for HTTPS
    checks.push(await this.checkHTTPS(projectPath, logger));

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
      description: '安全实践检查包括敏感信息保护、安全配置等',
    };
  }

  private async checkEnvNotCommitted(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const gitignorePath = path.join(projectPath, '.gitignore');
    
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const hasEnvIgnore = content.split('\n').some(line => 
        line.trim() === '.env' || 
        line.trim() === '.env.local' ||
        line.trim().startsWith('.env*')
      );

      return {
        id: 'env-not-committed',
        name: '环境变量保护',
        description: '检查 .env 文件是否被忽略',
        status: hasEnvIgnore ? 'pass' : 'warning',
        score: hasEnvIgnore ? 100 : 30,
        maxScore: 100,
        details: hasEnvIgnore ? '.env 文件已被 .gitignore 忽略' : '.env 文件可能被提交到版本控制',
        fixSuggestion: hasEnvIgnore ? undefined : '在 .gitignore 中添加 .env',
        severity: hasEnvIgnore ? undefined : 'warning',
      };
    } catch {
      return {
        id: 'env-not-committed',
        name: '环境变量保护',
        description: '检查 .env 文件是否被忽略',
        status: 'warning',
        score: 50,
        maxScore: 100,
        details: '未找到 .gitignore 文件',
        fixSuggestion: '创建 .gitignore 并添加 .env',
      };
    }
  }

  private async checkSecretsInCode(projectPath: string, logger: Logger): Promise<AuditCheck> {
    const secretPatterns = [
      { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'API Key' },
      { pattern: /secret[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Secret Key' },
      { pattern: /password\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Password' },
      { pattern: /token\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Token' },
      { pattern: /private[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi, name: 'Private Key' },
    ];

    const issues: string[] = [];
    let score = 100;

    try {
      const srcPath = path.join(projectPath, 'src');
      const files = await this.getAllFiles(srcPath);

      for (const file of files.slice(0, 50)) { // Check first 50 files
        if (!file.endsWith('.ts') && !file.endsWith('.tsx') && 
            !file.endsWith('.js') && !file.endsWith('.jsx')) {
          continue;
        }

        try {
          const content = await fs.readFile(file, 'utf-8');
          
          for (const { pattern, name } of secretPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              score -= 20;
              issues.push(`${path.basename(file)} 包含可能的 ${name}`);
            }
          }
        } catch {
          // Ignore file read errors
        }
      }
    } catch {
      // src not found
    }

    score = Math.max(0, score);

    return {
      id: 'secrets-in-code',
      name: '敏感信息检查',
      description: '检查代码中是否有硬编码的敏感信息',
      status: score >= 80 ? 'pass' : 'warning',
      score,
      maxScore: 100,
      details: issues.length > 0 ? `发现 ${issues.length} 个潜在问题` : '未发现硬编码的敏感信息',
      fixSuggestion: issues.length > 0 ? '将敏感信息移至环境变量' : undefined,
      severity: issues.length > 0 ? 'warning' : undefined,
    };
  }

  private async checkSecurityHeaders(projectPath: string, logger: Logger): Promise<AuditCheck> {
    // Check for security middleware in package.json
    const pkgPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      const securityPackages = [
        'helmet',
        'cors',
        'express-rate-limit',
        'hpp',
        'express-mongo-sanitize',
        'xss-clean',
      ];

      const found = securityPackages.filter(pkg => deps[pkg]);

      // Check for security configuration files
      const securityFiles = ['security.js', 'security.ts', 'middleware/security.ts'];
      let hasSecurityConfig = false;
      
      for (const file of securityFiles) {
        try {
          await fs.access(path.join(projectPath, 'src', file));
          hasSecurityConfig = true;
          break;
        } catch {
          // Not found
        }
      }

      let score = 50;
      if (found.length > 0) score += 30;
      if (hasSecurityConfig) score += 20;

      return {
        id: 'security-headers',
        name: '安全中间件',
        description: '检查是否配置了安全中间件',
        status: score >= 70 ? 'pass' : 'warning',
        score,
        maxScore: 100,
        details: found.length > 0 
          ? `已安装: ${found.join(', ')}`
          : '未找到安全中间件',
        fixSuggestion: found.length === 0 ? '安装 helmet 等安全中间件' : undefined,
      };
    } catch {
      return {
        id: 'security-headers',
        name: '安全中间件',
        description: '检查安全中间件配置',
        status: 'warning',
        score: 60,
        maxScore: 100,
        details: '无法检查安全配置',
      };
    }
  }

  private async checkHTTPS(projectPath: string, logger: Logger): Promise<AuditCheck> {
    // Check for HTTPS configuration
    const configFiles = [
      'next.config.js',
      'nuxt.config.js',
      'vite.config.ts',
      'webpack.config.js',
    ];

    for (const file of configFiles) {
      try {
        const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
        
        if (content.includes('https') || content.includes('ssl') || content.includes('cert')) {
          return {
            id: 'https-config',
            name: 'HTTPS 配置',
            description: '检查是否配置了 HTTPS',
            status: 'pass',
            score: 100,
            maxScore: 100,
            details: `${file} 中有 HTTPS 相关配置`,
          };
        }
      } catch {
        // File not found
      }
    }

    // Check package.json for HTTPS scripts
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      const scripts = pkg.scripts || {};
      const hasHttpsScript = Object.values(scripts).some(
        script => typeof script === 'string' && script.includes('https')
      );

      if (hasHttpsScript) {
        return {
          id: 'https-config',
          name: 'HTTPS 配置',
          description: '检查是否配置了 HTTPS',
          status: 'pass',
          score: 80,
          maxScore: 100,
          details: '有 HTTPS 相关脚本',
        };
      }
    } catch {
      // Ignore
    }

    return {
      id: 'https-config',
      name: 'HTTPS 配置',
      description: '检查是否配置了 HTTPS',
      status: 'warning',
      score: 60,
      maxScore: 100,
      details: '未找到 HTTPS 配置（生产环境建议使用 HTTPS）',
      fixSuggestion: '在生产环境配置 HTTPS',
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
