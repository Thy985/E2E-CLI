/**
 * Security Skill
 * Checks security vulnerabilities and best practices
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Severity,
  DiagnosisType,
} from '../../../types';
import { generateId } from '../../../utils';
import { shouldIgnore, isRuleEnabled, getRuleSeverity } from '../../../config';
import { shouldIgnoreLine, shouldIgnoreSection } from '../../../utils/ignore';

// Security rules to check
const SECURITY_RULES = [
  {
    id: 'hardcoded-secret',
    patterns: [
      /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]/gi,
      /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]+['"]/gi,
      /(?:secret|token)\s*[=:]\s*['"][a-zA-Z0-9]{16,}['"]/gi,
      /(?:private[_-]?key)\s*[=:]\s*['"][^'"]+['"]/gi,
    ],
    severity: 'critical' as Severity,
    title: '硬编码敏感信息',
    description: '代码中包含硬编码的敏感信息',
    suggestion: '将敏感信息移至环境变量',
  },
  {
    id: 'sql-injection',
    patterns: [
      /(?:query|execute)\s*\(\s*[`'"]\s*SELECT.*\$\{/gi,
      /(?:query|execute)\s*\(\s*[`'"]\s*.*\+\s*\w+/gi,
    ],
    severity: 'critical' as Severity,
    title: 'SQL 注入风险',
    description: '检测到可能的 SQL 注入漏洞',
    suggestion: '使用参数化查询',
  },
  {
    id: 'xss-risk',
    patterns: [
      /dangerouslySetInnerHTML\s*=\s*\{/g,
      /innerHTML\s*=\s*[^;]+\+/g,
      /document\.write\s*\(/g,
    ],
    severity: 'warning' as Severity,
    title: 'XSS 风险',
    description: '检测到可能的 XSS 漏洞',
    suggestion: '使用安全的 DOM 操作方法',
  },
  {
    id: 'eval-usage',
    patterns: [
      /eval\s*\(/g,
      /new\s+Function\s*\(/g,
    ],
    severity: 'warning' as Severity,
    title: 'eval 使用',
    description: '使用 eval 或 new Function 存在安全风险',
    suggestion: '避免使用 eval，使用更安全的替代方案',
  },
  {
    id: 'insecure-random',
    patterns: [
      /Math\.random\(\)/g,
    ],
    severity: 'info' as Severity,
    title: '不安全的随机数',
    description: 'Math.random() 不适用于安全敏感场景',
    suggestion: '使用 crypto.getRandomValues() 或 crypto.randomBytes()',
  },
  {
    id: 'http-url',
    patterns: [
      /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/g,
    ],
    severity: 'warning' as Severity,
    title: '不安全的 HTTP 连接',
    description: '使用 HTTP 而非 HTTPS 可能导致数据泄露',
    suggestion: '使用 HTTPS 协议',
  },
  {
    id: 'disabled-security',
    patterns: [
      /process\.env\.NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/g,
      /@ts-ignore.*security/gi,
      /eslint-disable.*security/gi,
    ],
    severity: 'critical' as Severity,
    title: '安全检查被禁用',
    description: '检测到安全检查被禁用',
    suggestion: '启用安全检查并修复问题',
  },
  {
    id: 'cors-wildcard',
    patterns: [
      /['"`]?Access-Control-Allow-Origin['"`]?\s*:\s*['"`]\*['"`]/g,
      /cors\s*\(\s*\{\s*origin\s*:\s*['"`]\*['"`]/g,
    ],
    severity: 'warning' as Severity,
    title: 'CORS 配置过于宽松',
    description: '允许所有来源的 CORS 配置存在安全风险',
    suggestion: '限制允许的来源',
  },
];

export class SecuritySkill extends BaseSkill {
  name = 'security';
  version = '1.0.0';
  description = '安全漏洞检查';

  triggers = [
    { type: 'command' as const, pattern: 'security' },
    { type: 'keyword' as const, pattern: /安全|security|漏洞|vulnerability|xss|sql注入/i },
  ];

  capabilities = [
    {
      name: 'secret-detection',
      description: '检测硬编码的敏感信息',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'injection-detection',
      description: '检测注入漏洞',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'dependency-audit',
      description: '依赖安全审计',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger, config } = context;

    logger.info('开始安全检查...');

    // Check source files
    const sourceFiles = await this.getSourceFiles(project.path, tools, config);
    logger.debug(`找到 ${sourceFiles.length} 个源文件`);

    for (const file of sourceFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content, config);
      diagnoses.push(...fileDiagnoses);
    }

    // Check configuration files
    const configIssues = await this.checkConfigFiles(project.path, tools, config);
    diagnoses.push(...configIssues);

    logger.info(`安全检查完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getSourceFiles(projectPath: string, tools: SkillContext['tools'], config?: SkillContext['config']): Promise<string[]> {
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => {
        if (f.includes('node_modules') || f.includes('.d.ts')) return false;
        if (config && shouldIgnore(f, config)) return false;
        return true;
      }));
    }

    return [...new Set(files)];
  }

  private async checkFile(filePath: string, content: string, config?: SkillContext['config']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Skip files based on config ignore patterns
    if (config && shouldIgnore(filePath, config)) {
      return diagnoses;
    }

    // Skip security skill definition file (contains rule patterns)
    const normalizedPath = filePath.replace(/\\/g, '/');
    const isSecurityDefinition = normalizedPath.includes('skills/builtin/security/index');
    
    for (const rule of SECURITY_RULES) {
      // Skip disabled-security rule in security skill definition file
      if (rule.id === 'disabled-security' && isSecurityDefinition) {
        continue;
      }
      
      // Check if rule is disabled in config
      if (config && !isRuleEnabled(rule.id, config, this.name)) {
        continue;
      }
      
      for (const pattern of rule.patterns) {
        const matches = content.matchAll(pattern);
        
        for (const match of matches) {
          const lineNumber = this.getLineNumber(content, match.index!);
          
          // Skip false positives in comments
          const line = content.split('\n')[lineNumber - 1];
          if (line?.trim().startsWith('//') || line?.trim().startsWith('*')) {
            continue;
          }

          // Skip false positives in example code or documentation
          if (line?.includes('@example') || line?.includes('```')) {
            continue;
          }

          // Check for ignore comments
          if (shouldIgnoreLine(content, lineNumber, rule.id)) {
            continue;
          }

          // Check for ignore section
          if (shouldIgnoreSection(content, lineNumber, lineNumber, rule.id)) {
            continue;
          }

          // Get severity from config or use default
          const severity = config 
            ? getRuleSeverity(rule.id, config, rule.severity, this.name)
            : rule.severity;

          diagnoses.push({
            id: `Sec-${generateId()}`,
            skill: this.name,
            type: 'security' as DiagnosisType,
            severity: severity,
            title: rule.title,
            description: rule.description,
            location: {
              file: filePath,
              line: lineNumber,
            },
            metadata: {
              ruleId: rule.id,
              matchedCode: match[0].slice(0, 50),
            },
            fixSuggestion: {
              description: rule.suggestion,
              autoApplicable: false,
              riskLevel: 'high',
            },
          });
        }
      }
    }

    return diagnoses;
  }

  private async checkConfigFiles(projectPath: string, tools: SkillContext['tools'], config?: SkillContext['config']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check .env files (should not be committed)
    const envFiles = await tools.fs.glob('.env*');
    for (const file of envFiles) {
      // Skip if ignored by config
      if (config && shouldIgnore(file, config)) continue;
      
      if (!file.includes('.example') && !file.includes('.sample')) {
        diagnoses.push({
          id: `Sec-${generateId()}`,
          skill: this.name,
          type: 'security' as DiagnosisType,
          severity: 'warning',
          title: '.env 文件可能被提交',
          description: '环境变量文件不应提交到版本控制',
          location: { file },
          fixSuggestion: {
            description: '将 .env 添加到 .gitignore',
            autoApplicable: false,
            riskLevel: 'medium',
          },
        });
      }
    }

    // Check for exposed config files
    const configPatterns = ['**/config*.json', '**/settings*.json'];
    for (const pattern of configPatterns) {
      const files = await tools.fs.glob(pattern);
      for (const file of files) {
        try {
          const content = await tools.fs.readFile(file);
          if (content.includes('password') || content.includes('secret') || content.includes('token')) {
            diagnoses.push({
              id: `Sec-${generateId()}`,
              skill: this.name,
              type: 'security' as DiagnosisType,
              severity: 'warning',
              title: '配置文件包含敏感信息',
              description: '配置文件可能包含敏感信息',
              location: { file },
              fixSuggestion: {
                description: '将敏感信息移至环境变量',
                autoApplicable: false,
                riskLevel: 'medium',
              },
            });
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    return diagnoses;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export default SecuritySkill;
