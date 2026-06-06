/**
 * Security Skill
 * Checks security vulnerabilities and best practices
 * 
 * Uses AST-based analysis (via @typescript-eslint/parser) for accurate
 * detection of eval(), innerHTML, dangerouslySetInnerHTML, etc.
 * Falls back to regex for patterns not easily detectable via AST
 * (e.g., hardcoded secrets in string literals).
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Severity,
  DiagnosisType,
  Fix,
  FileChange,
} from '../../../types';
import { generateId } from '../../../utils';
import { shouldIgnore, isRuleEnabled, getRuleSeverity } from '../../../config';
import { shouldIgnoreLine, shouldIgnoreSection } from '../../../utils/ignore';
import {
  parseFile,
  detectEvalCalls,
  detectXSSRisk,
  detectInsecureRandom,
  detectDocumentWrite,
} from '../../../utils/ast-analyzer';

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
    // Context-aware: skip in non-security contexts
    contextFilter: (line: string): boolean => {
      // Skip if used in UI animations, visual effects, random IDs for React keys,
      // test data generation, game mechanics, or random positioning
      const nonSecurityContexts = [
        /key\s*[=:]\s*.*Math\.random/i,        // React keys
        /Math\.random\(\)\s*\*\s*\d+\s*[+\-]/, // Visual positioning/scaling
        /opacity.*Math\.random|Math\.random.*opacity/i,
        /animation.*Math\.random|Math\.random.*animation/i,
        /color.*Math\.random|Math\.random.*color/i,
        /Math\.random\(\)\s*<\s*0?\.5/i,        // Simple boolean toggle (UI)
        /(?:mock|fixture|dummy|fake|test).*Math\.random/i,
        /Math\.random.*(?:mock|fixture|dummy|fake|test)/i,
        /className.*Math\.random|Math\.random.*className/i,
        /style.*Math\.random|Math\.random.*style/i,
        /randomize.*(?:order|position|layout)/i,
        /(?:shuffle|random).*(?:item|element|display)/i,
      ];
      return !nonSecurityContexts.some((r) => r.test(line));
    },
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

// File patterns that indicate test, mock, or example code (false positive sources)
const FALSE_POSITIVE_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /__tests__\//,
  /__mocks__\//,
  /\.mock\.(ts|tsx|js|jsx)$/,
  /\/mocks?\//,
  /\.stories\.(ts|tsx|js|jsx)$/,         // Storybook stories
  /\.story\.(ts|tsx|js|jsx)$/,
  /\/examples?\//,
  /\/example\.(ts|tsx|js|jsx)$/,
  /\/demo\//,
  /\.d\.ts$/,                             // Type declaration files
  /fixture/i,
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
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'injection-detection',
      description: '检测注入漏洞',
      autoFixable: true,
      riskLevel: 'low' as const,
    },
    {
      name: 'dependency-audit',
      description: '依赖安全审计',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    const ruleId = diagnosis.metadata?.ruleId;
    const filePath = diagnosis.location.file;
    const content = await context.tools.fs.readFile(filePath);

    let changes: FileChange[] = [];

    switch (ruleId) {
      case 'hardcoded-secret':
        changes = this.fixHardcodedSecret(content, diagnosis);
        break;
      case 'eval-usage':
        changes = this.fixEvalUsage(content, diagnosis);
        break;
      case 'xss-risk':
        changes = this.fixXSSRisk(content, diagnosis);
        break;
      case 'sql-injection':
        changes = this.fixSQLInjection(content, diagnosis);
        break;
      case 'insecure-random':
        changes = this.fixInsecureRandom(content, diagnosis);
        break;
      case 'http-url':
        changes = this.fixHTTPUrl(content, diagnosis);
        break;
      case 'cors-wildcard':
        changes = this.fixCORSWildcard(content, diagnosis);
        break;
      case 'disabled-security':
        changes = this.fixDisabledSecurity(content, diagnosis);
        break;
      default:
        throw new Error(`Cannot auto-fix rule: ${ruleId}`);
    }

    return {
      id: `Fix-${generateId()}`,
      diagnosisId: diagnosis.id,
      description: `修复 ${diagnosis.title}`,
      changes,
      riskLevel: 'low',
      autoApplicable: true,
    };
  }

  private fixHardcodedSecret(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Extract the variable name and replace value with process.env reference
    const varNameMatch = targetLine.match(/(?:const\s+|let\s+|var\s+)?(\w+)\s*[=:]\s*['"]/);
    const varName = varNameMatch ? varNameMatch[1] : 'API_KEY';

    // Map common variable names to env variable names
    const envMap: Record<string, string> = {
      password: 'DB_PASSWORD',
      passwd: 'DB_PASSWORD',
      pwd: 'DB_PASSWORD',
      apiKey: 'API_KEY',
      api_key: 'API_KEY',
      apikey: 'API_KEY',
      secret: 'SECRET',
      token: 'AUTH_TOKEN',
      privateKey: 'PRIVATE_KEY',
      private_key: 'PRIVATE_KEY',
    };

    const envName = envMap[varName.toLowerCase()] || varName.toUpperCase();
    const fixedLine = targetLine.replace(
      /(['"]?\w*['"]?)\s*[=:]\s*['"][^'"]{8,}['"]/,
      `$1 = process.env.${envName} || ''`
    );

    if (fixedLine === targetLine) return [];

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixEvalUsage(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Detect the eval pattern and suggest safe alternatives
    // eval(JSON) → JSON.parse
    // eval(expression) → Function constructor or safer alternative
    const jsonEvalMatch = targetLine.match(/eval\s*\(\s*(?:['"]\(.*['"]?\s*\+\s*(\w+)\s*\+\s*['"].*['"]\s*\)|['"](.+?)['"]\s*)\)/);
    let fixedLine: string;

    if (jsonEvalMatch) {
      // eval("(" + x + ")") pattern → JSON.parse
      fixedLine = targetLine.replace(
        /eval\s*\(\s*['"]\(\s*['"]?\s*\+\s*(\w+)\s*\+\s*['"]\s*\)\s*['"]\s*\)/g,
        'JSON.parse($1)'
      );
    } else if (targetLine.includes('eval(')) {
      // Generic eval — replace with comment and safe placeholder
      fixedLine = targetLine.replace(
        /eval\s*\((.+?)\)/g,
        '/* SECURITY FIX: Replace eval with safer alternative */ JSON.parse($1)'
      );
    } else {
      fixedLine = targetLine.replace(
        /new\s+Function\s*\(/g,
        '/* SECURITY FIX: Replace new Function with safer alternative */ function('
      );
    }

    if (fixedLine === targetLine) return [];

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixXSSRisk(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Handle dangerouslySetInnerHTML (React) — wrap value with DOMPurify.sanitize
    if (matchedCode.includes('dangerouslySetInnerHTML')) {
      const fixedLine = targetLine.replace(
        /dangerouslySetInnerHTML\s*=\s*\{\s*__html:\s*(\w+)\s*\}/g,
        'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize($1) }}'
      );
      return [{
        file: diagnosis.location.file,
        type: 'replace',
        position: { line, column: 1 },
        content: fixedLine,
        oldContent: targetLine,
      }];
    }

    // Handle innerHTML — replace with textContent only when the assignment is purely concatenation
    // This preserves the original intent of setting text content safely
    if (matchedCode.includes('innerHTML')) {
      // Check if it's a string concatenation pattern: .innerHTML = 'text' + var + 'text'
      const concatMatch = targetLine.match(/(\w+\.innerHTML)\s*=\s*['"]([^'"]*)['"]\s*\+\s*(\w+)\s*\+\s*['"]([^'"]*)['"]/);
      if (concatMatch) {
        // Replace: el.innerHTML = 'prefix' + userInput + 'suffix'
        // With: el.textContent = 'prefix' + userInput + 'suffix'
        // This is safe because textContent does NOT interpret HTML
        const fixedLine = targetLine.replace(
          /\.innerHTML\s*=\s*['"][^'"]*['"]\s*\+\s*\w+\s*\+\s*['"][^'"]*['"]/,
          '.textContent = ' + concatMatch[2] + ' + ' + concatMatch[3] + ' + ' + concatMatch[4]
        );
        return [{
          file: diagnosis.location.file,
          type: 'replace',
          position: { line, column: 1 },
          content: fixedLine,
          oldContent: targetLine,
        }];
      }

      // Simple innerHTML assignment without concatenation
      const fixedLine = targetLine.replace(
        /\.innerHTML\s*=\s*(.+?);?$/,
        '.textContent = $1;'
      );
      return [{
        file: diagnosis.location.file,
        type: 'replace',
        position: { line, column: 1 },
        content: fixedLine,
        oldContent: targetLine,
      }];
    }

    // Fallback: wrap with DOMPurify.sanitize
    const fixedLine = targetLine.replace(
      /\.innerHTML\s*=\s*(.+?);?$/,
      '.innerHTML = DOMPurify.sanitize($1);'
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixSQLInjection(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Replace template literal string concatenation with parameterized query
    // Template: query(`SELECT * FROM users WHERE id = ${userId}`)
    // Fixed:    query('SELECT * FROM users WHERE id = ?', [userId])
    const templateMatch = targetLine.match(/`([^`]*)\$/);
    if (templateMatch) {
      // Extract the SQL string and variables from template literal
      let sqlPart = targetLine.match(/`([^`]*)`/)?.[1];
      const variables: string[] = [];

      if (sqlPart) {
        // Replace ${var} with ? and collect variables
        sqlPart = sqlPart.replace(/\$\{(\w+)\}/g, (_match, varName) => {
          variables.push(varName);
          return '?';
        });
      }

      const fixedLine = variables.length > 0
        ? targetLine.replace(/`[^`]*`/, `'${sqlPart}'`).replace(
          /\)\s*$/,
          `, [${variables.join(', ')}])`
        )
        : targetLine;

      return [{
        file: diagnosis.location.file,
        type: 'replace',
        position: { line, column: 1 },
        content: fixedLine,
        oldContent: targetLine,
      }];
    }

    // String concatenation pattern: "SELECT * FROM users WHERE id = " + userId
    // Replace with parameterized style placeholder
    const fixedLine = targetLine
      .replace(/\s*\+\s*(\w+)\s*$/g, ', [$1]')
      .replace(/=\s*["']/g, "= '");

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixInsecureRandom(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Replace Math.random() with crypto.getRandomValues
    const fixedLine = targetLine.replace(
      /Math\.random\(\)\s*\*\s*(\w+\.length|\d+)/g,
      'crypto.getRandomValues(new Uint32Array(1))[0] % $1'
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixHTTPUrl(content: string, diagnosis: Diagnosis): FileChange[] {
    const matchedCode = diagnosis.metadata?.matchedCode as string | undefined;
    if (!matchedCode) return [];

    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Replace http:// with https://
    const fixedLine = targetLine.replace(
      /['"]http:\/\/([^'"]+)['"]/g,
      "'https://$1'"
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixCORSWildcard(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Replace wildcard origin with specific domain
    const fixedLine = targetLine.replace(
      /origin\s*:\s*['"]\*['"]/g,
      "origin: ['https://example.com', 'https://www.example.com']"
    );

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

  private fixDisabledSecurity(content: string, diagnosis: Diagnosis): FileChange[] {
    const line = diagnosis.location.line || 1;
    const lines = content.split('\n');
    const targetLine = lines[line - 1];

    // Replace disabled security settings with enabled ones
    const fixedLine = targetLine
      .replace(/contentSecurityPolicy\s*:\s*false/g, 'contentSecurityPolicy: true')
      .replace(/xssFilter\s*:\s*false/g, 'xssFilter: true')
      .replace(/noSniff\s*:\s*false/g, 'noSniff: true')
      .replace(/frameguard\s*:\s*false/g, 'frameguard: true');

    return [{
      file: diagnosis.location.file,
      type: 'replace',
      position: { line, column: 1 },
      content: fixedLine,
      oldContent: targetLine,
    }];
  }

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

  private async getSourceFiles(_projectPath: string, tools: SkillContext['tools'], config?: SkillContext['config']): Promise<string[]> {
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

    // Skip test files, mock files, and example/documentation code to reduce false positives
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (FALSE_POSITIVE_FILE_PATTERNS.some((p) => p.test(normalizedPath))) {
      return diagnoses;
    }

    // ---- Phase 1: AST-based analysis (accurate, zero false positives) ----
    const astFile = parseFile(filePath, content);
    if (astFile) {
      const astIssues = this.runASTChecks(astFile, config);
      diagnoses.push(...astIssues);
    }

    // ---- Phase 2: Regex-based analysis (for patterns not covered by AST) ----
    diagnoses.push(...this.runRegexChecks(filePath, content, config));

    return diagnoses;
  }

  /**
   * Run AST-based security checks.
   * These are more accurate than regex because they use the parsed syntax tree.
   */
  private runASTChecks(astFile: ReturnType<typeof parseFile>, config?: SkillContext['config']): Diagnosis[] {
    if (!astFile) return [];
    const diagnoses: Diagnosis[] = [];

    // eval() / new Function() detection via AST
    for (const issue of detectEvalCalls(astFile)) {
      if (config && !isRuleEnabled(issue.ruleId, config, this.name)) continue;
      if (shouldIgnoreLine(astFile.source, issue.line, issue.ruleId)) continue;
      const severity = config
        ? getRuleSeverity(issue.ruleId, config, 'warning', this.name)
        : 'warning' as Severity;
      diagnoses.push(this.makeDiagnosis(astFile.filePath, issue.ruleId, issue.line, severity, issue.message, issue.snippet));
    }

    // XSS risk detection (dangerouslySetInnerHTML, innerHTML, document.write)
    for (const issue of [...detectXSSRisk(astFile), ...detectDocumentWrite(astFile)]) {
      if (config && !isRuleEnabled(issue.ruleId, config, this.name)) continue;
      if (shouldIgnoreLine(astFile.source, issue.line, issue.ruleId)) continue;
      const severity = config
        ? getRuleSeverity(issue.ruleId, config, 'warning', this.name)
        : 'warning' as Severity;
      diagnoses.push(this.makeDiagnosis(astFile.filePath, issue.ruleId, issue.line, severity, issue.message, issue.snippet));
    }

    // Insecure random detection
    for (const issue of detectInsecureRandom(astFile)) {
      if (config && !isRuleEnabled(issue.ruleId, config, this.name)) continue;
      if (shouldIgnoreLine(astFile.source, issue.line, issue.ruleId)) continue;
      const severity = config
        ? getRuleSeverity(issue.ruleId, config, 'info', this.name)
        : 'info' as Severity;
      diagnoses.push(this.makeDiagnosis(astFile.filePath, issue.ruleId, issue.line, severity, issue.message, issue.snippet));
    }

    return diagnoses;
  }

  /**
   * Run regex-based security checks for patterns that are hard to detect via AST.
   * E.g., hardcoded secrets, SQL injection patterns, HTTP URLs, CORS config.
   */
  private runRegexChecks(filePath: string, content: string, config?: SkillContext['config']): Diagnosis[] {
    const diagnoses: Diagnosis[] = [];
    const isSecurityDefinition = filePath.replace(/\\/g, '/').includes('skills/builtin/security/index');

    // Regex-only rules (hardcoded secrets, SQL injection, HTTP URL, CORS, disabled security)
    const regexRules = SECURITY_RULES.filter(rule =>
      !['eval-usage', 'xss-risk', 'insecure-random'].includes(rule.id)
    );

    for (const rule of regexRules) {
      if (rule.id === 'disabled-security' && isSecurityDefinition) continue;
      if (config && !isRuleEnabled(rule.id, config, this.name)) continue;

      for (const pattern of rule.patterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const lineNumber = this.getLineNumber(content, match.index!);
          const line = content.split('\n')[lineNumber - 1];
          if (line?.trim().startsWith('//') || line?.trim().startsWith('*')) continue;
          if (line?.includes('@example') || line?.includes('```')) continue;
          if (shouldIgnoreLine(content, lineNumber, rule.id)) continue;
          if (shouldIgnoreSection(content, lineNumber, lineNumber, rule.id)) continue;

          const severity = config
            ? getRuleSeverity(rule.id, config, rule.severity, this.name)
            : rule.severity;
          diagnoses.push({
            id: `Sec-${generateId()}`,
            skill: this.name,
            type: 'security' as DiagnosisType,
            severity,
            title: rule.title,
            description: rule.description,
            location: { file: filePath, line: lineNumber },
            metadata: { ruleId: rule.id, matchedCode: match[0].slice(0, 50) },
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

  /** Create a standardized Diagnosis object. */
  private makeDiagnosis(
    filePath: string,
    ruleId: string,
    line: number,
    severity: Severity,
    message: string,
    snippet: string
  ): Diagnosis {
    const ruleMeta = SECURITY_RULES.find(r => r.id === ruleId);
    return {
      id: `Sec-${generateId()}`,
      skill: this.name,
      type: 'security' as DiagnosisType,
      severity,
      title: ruleMeta?.title ?? ruleId,
      description: message,
      location: { file: filePath, line },
      metadata: { ruleId, matchedCode: snippet.slice(0, 50) },
      fixSuggestion: {
        description: ruleMeta?.suggestion ?? '修复此安全问题',
        autoApplicable: false,
        riskLevel: 'high',
      },
    };
  }

  private async checkConfigFiles(projectPath: string, tools: SkillContext['tools'], config?: SkillContext['config']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    // Check .env files (should not be committed unless in .gitignore)
    const envFiles = await tools.fs.glob('.env*');
    for (const file of envFiles) {
      // Skip if ignored by config
      if (config && shouldIgnore(file, config)) continue;
      
      // Skip example/sample files
      if (file.includes('.example') || file.includes('.sample')) continue;
      
      // Check if .env is covered by .gitignore
      const isIgnored = await this.isEnvInGitignore(projectPath, tools, file);
      if (!isIgnored) {
        diagnoses.push({
          id: `Sec-${generateId()}`,
          skill: this.name,
          type: 'security' as DiagnosisType,
          severity: 'warning',
          title: '.env 文件可能被提交',
          description: '环境变量文件不应提交到版本控制，请确保 .env 已添加到 .gitignore',
          location: { file },
          fixSuggestion: {
            description: '将 .env 添加到 .gitignore',
            autoApplicable: true,
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

  /**
   * Check if a given env file path is covered by .gitignore entries
   */
  private async isEnvInGitignore(projectPath: string, tools: SkillContext['tools'], envFile: string): Promise<boolean> {
    try {
      const gitignorePath = `${projectPath}/.gitignore`;
      const exists = await tools.fs.exists(gitignorePath);
      if (!exists) return false;

      const gitignoreContent = await tools.fs.readFile(gitignorePath);
      const lines = gitignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

      // Extract the basename of the env file (e.g. ".env", ".env.local")
      const envBasename = envFile.split('/').pop() || envFile;

      for (const pattern of lines) {
        // Exact match
        if (pattern === envBasename) return true;
        // Wildcard match: .env* covers .env, .env.local, .env.production, etc.
        if (pattern === '.env*' || pattern.endsWith('/.env*')) return true;
        // Glob-style: *.env covers *.env files
        if (pattern.endsWith('.env*') && envBasename.startsWith(pattern.replace('*', ''))) return true;
        // Direct env pattern
        if (pattern === '.env' && envBasename === '.env') return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export default SecuritySkill;
