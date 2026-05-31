/**
 * Dependency Skill
 * 
 * 检查依赖相关问题：
 * 1. 过时的依赖
 * 2. 安全漏洞
 * 3. 重复依赖
 * 4. 未使用的依赖
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Severity,
  Fix,
} from '../../../types';
import { DependencyFixGenerator } from './fixers/dependency-fix-generator';

export class DependencySkill extends BaseSkill {
  name = 'dependency';
  version = '1.0.0';
  description = 'Dependency health checker';

  triggers = [
    { type: 'command' as const, pattern: 'dependency', priority: 100 },
    { type: 'keyword' as const, pattern: /dependency|package|npm|yarn|outdated/i, priority: 80 },
    { type: 'file' as const, pattern: /package\.json$/i, priority: 100 },
  ];

  capabilities = [
    { name: 'outdated-check', description: 'Check outdated dependencies', autoFixable: true, riskLevel: 'low' as const },
    { name: 'vulnerability-check', description: 'Check security vulnerabilities', autoFixable: false, riskLevel: 'high' as const },
    { name: 'duplicate-check', description: 'Check duplicate dependencies', autoFixable: true, riskLevel: 'low' as const },
    { name: 'unused-check', description: 'Check unused dependencies', autoFixable: true, riskLevel: 'medium' as const },
  ];

  private fixGenerator: DependencyFixGenerator;

  constructor() {
    super();
    this.fixGenerator = new DependencyFixGenerator();
  }

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project } = context;

    const packageJsonPath = path.join(project.path, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return issues;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // 检查过时的依赖
    context.logger.info('🔍 Checking outdated dependencies...');
    const outdatedIssues = await this.checkOutdated(packageJson, packageJsonPath);
    issues.push(...outdatedIssues);

    // 检查重复依赖
    context.logger.info('🔍 Checking duplicate dependencies...');
    const duplicateIssues = this.checkDuplicates(packageJson, packageJsonPath);
    issues.push(...duplicateIssues);

    // 检查依赖版本范围
    context.logger.info('🔍 Checking version ranges...');
    const versionIssues = this.checkVersionRanges(packageJson, packageJsonPath);
    issues.push(...versionIssues);

    // 检查 peer dependencies
    context.logger.info('🔍 Checking peer dependencies...');
    const peerIssues = this.checkPeerDependencies(packageJson, packageJsonPath);
    issues.push(...peerIssues);

    // 检查 devDependencies 误用
    context.logger.info('🔍 Checking dependency placement...');
    const placementIssues = this.checkDependencyPlacement(packageJson, packageJsonPath);
    issues.push(...placementIssues);

    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    return await this.fixGenerator.generateFix(diagnosis, context.project.path);
  }

  canAutoFix(diagnosis: Diagnosis): boolean {
    const autoFixableTypes = [
      'outdated',
      'duplicate',
      'wrong-placement',
      'unsafe-version',
      'exact-version',
    ];
    return autoFixableTypes.includes(diagnosis.metadata?.type);
  }

  private async checkOutdated(packageJson: any, file: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // 已知的主要版本更新（示例数据）
    const knownOutdated: Record<string, { current: string; latest: string; breaking: boolean }> = {
      'react': { current: '^16', latest: '^18', breaking: true },
      'vue': { current: '^2', latest: '^3', breaking: true },
      'webpack': { current: '^4', latest: '^5', breaking: true },
      'eslint': { current: '^7', latest: '^8', breaking: false },
    };

    for (const [name, version] of Object.entries(dependencies)) {
      const versionStr = version as string;
      
      // 检查是否使用了已知过时的主要版本
      for (const [pkg, info] of Object.entries(knownOutdated)) {
        if (name === pkg && versionStr.includes(info.current.replace('^', ''))) {
          issues.push({
            id: `dep-outdated-${name}`,
            skill: 'dependency',
            type: 'dependency',
            severity: info.breaking ? 'warning' : 'info',
            title: `Outdated dependency: ${name}`,
            description: `${name} ${versionStr} is outdated. Latest is ${info.latest}`,
            location: { file, line: 1, column: 1 },
            metadata: {
              category: 'dependency',
              type: 'outdated',
              package: name,
              current: versionStr,
              latest: info.latest,
              breaking: info.breaking,
              suggestion: info.breaking 
                ? `Review breaking changes before upgrading to ${info.latest}`
                : `Consider upgrading to ${info.latest}`,
            },
          });
        }
      }

      // 检查是否使用了不安全��版本范围
      if (versionStr === '*' || versionStr === 'latest') {
        issues.push({
          id: `dep-unsafe-range-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Unsafe version range: ${name}`,
          description: `Using "${versionStr}" can lead to unexpected breaking changes`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'unsafe-version',
            package: name,
            suggestion: 'Use specific version range like "^1.2.3"',
          },
        });
      }
    }

    return issues;
  }

  private checkDuplicates(packageJson: any, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    // 检查是否同时在 dependencies 和 devDependencies 中
    for (const name of Object.keys(deps)) {
      if (devDeps[name]) {
        issues.push({
          id: `dep-duplicate-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Duplicate dependency: ${name}`,
          description: `${name} is listed in both dependencies and devDependencies`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'duplicate',
            package: name,
            suggestion: 'Remove from devDependencies if needed in production',
          },
        });
      }
    }

    return issues;
  }

  private checkVersionRanges(packageJson: any, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [name, version] of Object.entries(dependencies)) {
      const versionStr = version as string;

      // 检查是否锁定了精确版本（不推荐）
      if (/^\d+\.\d+\.\d+$/.test(versionStr)) {
        issues.push({
          id: `dep-exact-version-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'info',
          title: `Exact version pinned: ${name}`,
          description: `${name} is pinned to exact version ${versionStr}. Consider using ^ or ~ for flexibility`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'exact-version',
            package: name,
            suggestion: 'Use ^' + versionStr + ' for minor updates or ~' + versionStr + ' for patch updates',
          },
        });
      }

      // 检查是否使用了 git URL
      if (versionStr.startsWith('git://') || versionStr.startsWith('git+')) {
        issues.push({
          id: `dep-git-url-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Git URL dependency: ${name}`,
          description: 'Using git URLs can cause installation issues and is harder to track',
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'git-url',
            package: name,
            suggestion: 'Publish to npm or use a specific version tag',
          },
        });
      }

      // 检查是否使用了本地路径
      if (versionStr.startsWith('file:') || versionStr.startsWith('.')) {
        issues.push({
          id: `dep-local-path-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'info',
          title: `Local path dependency: ${name}`,
          description: 'Local path dependencies may cause issues in CI/CD',
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'local-path',
            package: name,
            suggestion: 'Consider using npm link or publishing to a private registry',
          },
        });
      }
    }

    return issues;
  }

  private checkPeerDependencies(packageJson: any, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const peerDeps = packageJson.peerDependencies || {};
    const deps = packageJson.dependencies || {};

    // 检查 peer dependencies 是否也在 dependencies 中
    for (const name of Object.keys(peerDeps)) {
      if (deps[name]) {
        issues.push({
          id: `dep-peer-in-deps-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Peer dependency in dependencies: ${name}`,
          description: `${name} is both a peer dependency and regular dependency`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'peer-in-deps',
            package: name,
            suggestion: 'Remove from dependencies, keep only in peerDependencies',
          },
        });
      }
    }

    return issues;
  }

  private checkDependencyPlacement(packageJson: any, file: string): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    // 常见的应该在 devDependencies 的包
    const shouldBeDevDeps = [
      'eslint', 'prettier', 'jest', 'mocha', 'chai', 'vitest',
      'webpack', 'vite', 'rollup', 'esbuild',
      'typescript', '@types/', 'ts-node',
      'nodemon', 'concurrently',
      '@testing-library/', 'cypress', 'playwright',
    ];

    for (const [name] of Object.entries(deps)) {
      const shouldBeDev = shouldBeDevDeps.some(pattern => 
        pattern.endsWith('/') ? name.startsWith(pattern) : name === pattern
      );

      if (shouldBeDev) {
        issues.push({
          id: `dep-wrong-placement-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Dependency in wrong section: ${name}`,
          description: `${name} should be in devDependencies, not dependencies`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'wrong-placement',
            package: name,
            suggestion: 'Move to devDependencies',
          },
        });
      }
    }

    // 常见的应该在 dependencies 的包（如果在 devDependencies 中）
    const shouldBeDeps = [
      'react', 'vue', 'angular',
      'express', 'koa', 'fastify',
      'axios', 'lodash', 'moment', 'dayjs',
    ];

    for (const [name] of Object.entries(devDeps)) {
      if (shouldBeDeps.includes(name)) {
        issues.push({
          id: `dep-wrong-placement-dev-${name}`,
          skill: 'dependency',
          type: 'dependency',
          severity: 'warning',
          title: `Dependency in wrong section: ${name}`,
          description: `${name} should be in dependencies, not devDependencies`,
          location: { file, line: 1, column: 1 },
          metadata: {
            category: 'dependency',
            type: 'wrong-placement',
            package: name,
            suggestion: 'Move to dependencies',
          },
        });
      }
    }

    return issues;
  }
}

export default DependencySkill;
