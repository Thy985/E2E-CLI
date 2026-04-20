/**
 * Performance Skill
 * Checks performance issues and optimization opportunities
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

// Performance rules to check
const PERFORMANCE_RULES = [
  {
    id: 'large-bundle',
    pattern: /import\s+.*\s+from\s+['"]lodash['"]/g,
    severity: 'warning' as Severity,
    title: '大体积依赖导入',
    description: '导入整个 lodash 库会增加打包体积',
    suggestion: '使用 lodash-es 或按需导入具体函数',
    fix: 'import { func } from "lodash-es"',
  },
  {
    id: 'sync-script',
    pattern: /<script\s+src=['"][^'"]+['"]\s*>\s*<\/script>/g,
    severity: 'warning' as Severity,
    title: '同步脚本加载',
    description: '同步加载的脚本会阻塞页面渲染',
    suggestion: '添加 async 或 defer 属性',
    fix: '添加 async 或 defer 属性',
  },
  {
    id: 'unoptimized-image',
    pattern: /<img[^>]*src=['"][^'"]*\.(png|jpg|jpeg)['"][^>]*>/gi,
    severity: 'info' as Severity,
    title: '未优化的图片格式',
    description: '使用传统图片格式可能影响加载性能',
    suggestion: '考虑使用 WebP 或 AVIF 格式',
    fix: '使用 WebP 格式并提供 fallback',
  },
  {
    id: 'inline-style',
    pattern: /style=\s*['"][^'"]{100,}['"]/g,
    severity: 'info' as Severity,
    title: '内联样式过长',
    description: '过长的内联样式会影响缓存和可维护性',
    suggestion: '将样式移至 CSS 文件',
    fix: '提取样式到 CSS 类',
  },
  {
    id: 'console-log',
    pattern: /console\.(log|debug|info|warn)\s*\(/g,
    severity: 'info' as Severity,
    title: '生产环境 console 语句',
    description: '生产环境应移除 console 语句',
    suggestion: '使用环境变量控制日志输出',
    fix: '移除或使用条件判断包裹',
  },
  {
    id: 'large-component',
    check: (content: string) => {
      const lines = content.split('\n').length;
      return lines > 300;
    },
    severity: 'warning' as Severity,
    title: '组件文件过大',
    description: '超过 300 行的组件难以维护和优化',
    suggestion: '拆分为更小的子组件',
    fix: '拆分组件逻辑',
  },
];

export class PerformanceSkill extends BaseSkill {
  name = 'performance';
  version = '1.0.0';
  description = '性能优化检查';

  triggers = [
    { type: 'command' as const, pattern: 'performance' },
    { type: 'keyword' as const, pattern: /性能|performance|优化|optimize|速度|speed/i },
  ];

  capabilities = [
    {
      name: 'bundle-analysis',
      description: '检查打包体积和依赖',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'code-splitting',
      description: '检查代码分割机会',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'image-optimization',
      description: '检查图片优化机会',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    const { project, tools, logger } = context;

    logger.info('开始性能检查...');

    // Check source files
    const sourceFiles = await this.getSourceFiles(project.path, tools);
    logger.debug(`找到 ${sourceFiles.length} 个源文件`);

    for (const file of sourceFiles) {
      const content = await tools.fs.readFile(file);
      const fileDiagnoses = await this.checkFile(file, content);
      diagnoses.push(...fileDiagnoses);
    }

    // Check for large files
    const largeFileIssues = await this.checkLargeFiles(project.path, tools);
    diagnoses.push(...largeFileIssues);

    // Check package.json for optimization opportunities
    const packageIssues = await this.checkPackageJson(project.path, tools);
    diagnoses.push(...packageIssues);

    logger.info(`性能检查完成，发现 ${diagnoses.length} 个问题`);
    return diagnoses;
  }

  private async getSourceFiles(projectPath: string, tools: SkillContext['tools']): Promise<string[]> {
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await tools.fs.glob(pattern);
      files.push(...matches.filter(f => 
        !f.includes('node_modules') && 
        !f.includes('.test.') &&
        !f.includes('.spec.')
      ));
    }

    return [...new Set(files)];
  }

  private async checkFile(filePath: string, content: string): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    for (const rule of PERFORMANCE_RULES) {
      if (rule.pattern) {
        const matches = content.matchAll(rule.pattern);
        for (const match of matches) {
          const lineNumber = this.getLineNumber(content, match.index!);
          
          diagnoses.push({
            id: `Perf-${generateId()}`,
            skill: this.name,
            type: 'performance' as DiagnosisType,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            location: {
              file: filePath,
              line: lineNumber,
            },
            metadata: {
              ruleId: rule.id,
              matchedCode: match[0].slice(0, 100),
            },
            fixSuggestion: {
              description: rule.suggestion,
              autoApplicable: false,
              riskLevel: 'low',
            },
          });
        }
      } else if (rule.check && rule.check(content)) {
        diagnoses.push({
          id: `Perf-${generateId()}`,
          skill: this.name,
          type: 'performance' as DiagnosisType,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          location: {
            file: filePath,
          },
          metadata: {
            ruleId: rule.id,
          },
          fixSuggestion: {
            description: rule.suggestion,
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    }

    return diagnoses;
  }

  private async checkLargeFiles(projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];
    
    // Check for large JS/CSS files
    const jsFiles = await tools.fs.glob('**/*.js');
    const cssFiles = await tools.fs.glob('**/*.css');
    
    const allFiles = [...jsFiles, ...cssFiles].filter(f => 
      !f.includes('node_modules') && !f.includes('.min.')
    );

    for (const file of allFiles) {
      try {
        const stat = await tools.fs.stat(file);
        const sizeKB = stat.size / 1024;
        
        if (sizeKB > 100) {
          diagnoses.push({
            id: `Perf-${generateId()}`,
            skill: this.name,
            type: 'performance' as DiagnosisType,
            severity: sizeKB > 500 ? 'warning' : 'info',
            title: '大文件警告',
            description: `文件大小 ${(sizeKB).toFixed(1)}KB，可能影响加载性能`,
            location: { file },
            fixSuggestion: {
              description: '考虑代码分割或压缩',
              autoApplicable: false,
              riskLevel: 'low',
            },
          });
        }
      } catch {
        // Ignore stat errors
      }
    }

    return diagnoses;
  }

  private async checkPackageJson(projectPath: string, tools: SkillContext['tools']): Promise<Diagnosis[]> {
    const diagnoses: Diagnosis[] = [];

    try {
      const pkgPath = `${projectPath}/package.json`;
      const content = await tools.fs.readFile(pkgPath);
      const pkg = JSON.parse(content);

      // Check for known heavy dependencies
      const heavyDeps = ['moment', 'lodash', 'jquery', 'rxjs'];
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const dep of heavyDeps) {
        if (deps[dep]) {
          diagnoses.push({
            id: `Perf-${generateId()}`,
            skill: this.name,
            type: 'performance' as DiagnosisType,
            severity: 'info',
            title: '重量级依赖',
            description: `${dep} 是一个较大的依赖库`,
            location: { file: 'package.json' },
            metadata: { dependency: dep },
            fixSuggestion: {
              description: `考虑使用更轻量的替代方案`,
              autoApplicable: false,
              riskLevel: 'medium',
            },
          });
        }
      }

      // Check for duplicate dependencies
      const depNames = Object.keys(pkg.dependencies || {});
      const devDepNames = Object.keys(pkg.devDependencies || {});
      const duplicates = depNames.filter(name => devDepNames.includes(name));

      if (duplicates.length > 0) {
        diagnoses.push({
          id: `Perf-${generateId()}`,
          skill: this.name,
          type: 'performance' as DiagnosisType,
          severity: 'info',
          title: '重复依赖',
          description: `以下依赖同时存在于 dependencies 和 devDependencies: ${duplicates.join(', ')}`,
          location: { file: 'package.json' },
          fixSuggestion: {
            description: '移除 devDependencies 中的重复依赖',
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    } catch {
      // Ignore errors
    }

    return diagnoses;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export default PerformanceSkill;
