/**
 * Dependency Fix Generator
 * 
 * 自动生成依赖修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class DependencyFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'outdated':
        return this.fixOutdated(fullPath, diagnosis);
      
      case 'duplicate':
        return this.fixDuplicate(fullPath, diagnosis);
      
      case 'wrong-placement':
        return this.fixWrongPlacement(fullPath, diagnosis);
      
      case 'unsafe-version':
        return this.fixUnsafeVersion(fullPath, diagnosis);
      
      case 'exact-version':
        return this.fixExactVersion(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixOutdated(filePath: string, diagnosis: Diagnosis): Fix {
    const { package: pkg, current, latest } = diagnosis.metadata || {};
    
    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Update ${pkg} from ${current} to ${latest}`,
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: `"${pkg}": "${current}"`,
          replace: `"${pkg}": "${latest}"`,
          line: diagnosis.location.line,
        },
      ],
      notes: `Run "npm install" after applying this fix. Review breaking changes before upgrading.`,
    };
  }

  private fixDuplicate(filePath: string, diagnosis: Diagnosis): Fix {
    const { package: pkg } = diagnosis.metadata || {};
    
    // 读取 package.json
    const content = fs.readFileSync(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    // 确定应该保留在哪个部分
    const shouldBeInDeps = this.shouldBeInDependencies(pkg);
    
    if (shouldBeInDeps) {
      // 从 devDependencies 中删除
      delete packageJson.devDependencies[pkg];
    } else {
      // 从 dependencies 中删除
      delete packageJson.dependencies[pkg];
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Remove duplicate ${pkg} from ${shouldBeInDeps ? 'devDependencies' : 'dependencies'}`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: content,
          replace: JSON.stringify(packageJson, null, 2),
          line: 1,
        },
      ],
    };
  }

  private fixWrongPlacement(filePath: string, diagnosis: Diagnosis): Fix {
    const { package: pkg } = diagnosis.metadata || {};
    
    // 读取 package.json
    const content = fs.readFileSync(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    const shouldBeInDeps = this.shouldBeInDependencies(pkg);
    
    if (shouldBeInDeps) {
      // 从 devDependencies 移动到 dependencies
      if (packageJson.devDependencies?.[pkg]) {
        const version = packageJson.devDependencies[pkg];
        packageJson.dependencies = packageJson.dependencies || {};
        packageJson.dependencies[pkg] = version;
        delete packageJson.devDependencies[pkg];
      }
    } else {
      // 从 dependencies 移动到 devDependencies
      if (packageJson.dependencies?.[pkg]) {
        const version = packageJson.dependencies[pkg];
        packageJson.devDependencies = packageJson.devDependencies || {};
        packageJson.devDependencies[pkg] = version;
        delete packageJson.dependencies[pkg];
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Move ${pkg} to ${shouldBeInDeps ? 'dependencies' : 'devDependencies'}`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: content,
          replace: JSON.stringify(packageJson, null, 2),
          line: 1,
        },
      ],
    };
  }

  private fixUnsafeVersion(filePath: string, diagnosis: Diagnosis): Fix {
    const { package: pkg } = diagnosis.metadata || {};
    
    // 读取 package.json
    const content = fs.readFileSync(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    // 查找当前版本
    let currentVersion = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg];
    
    // 替换为安全的版本范围
    if (currentVersion === '*' || currentVersion === 'latest') {
      const safeVersion = '^1.0.0'; // 默认使用 ^1.0.0，实际应该查询最新版本
      
      if (packageJson.dependencies?.[pkg]) {
        packageJson.dependencies[pkg] = safeVersion;
      }
      if (packageJson.devDependencies?.[pkg]) {
        packageJson.devDependencies[pkg] = safeVersion;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Replace unsafe version with safe version range for ${pkg}`,
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: content,
          replace: JSON.stringify(packageJson, null, 2),
          line: 1,
        },
      ],
      notes: 'Review and update to the actual latest version',
    };
  }

  private fixExactVersion(filePath: string, diagnosis: Diagnosis): Fix {
    const { package: pkg } = diagnosis.metadata || {};
    
    // 读取 package.json
    const content = fs.readFileSync(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    // 查找当前版本
    let currentVersion = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg];
    
    // 添加 ^ 前缀
    if (currentVersion && /^\d/.test(currentVersion)) {
      const newVersion = '^' + currentVersion;
      
      if (packageJson.dependencies?.[pkg]) {
        packageJson.dependencies[pkg] = newVersion;
      }
      if (packageJson.devDependencies?.[pkg]) {
        packageJson.devDependencies[pkg] = newVersion;
      }
    }

    return {
      id: `fix-${diagnosis.id}`,
      type: 'code-change',
      description: `Add caret (^) to ${pkg} version for minor updates`,
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          search: content,
          replace: JSON.stringify(packageJson, null, 2),
          line: 1,
        },
      ],
    };
  }

  private shouldBeInDependencies(pkg: string): boolean {
    const shouldBeDeps = [
      'react', 'vue', 'angular',
      'express', 'koa', 'fastify',
      'axios', 'lodash', 'moment', 'dayjs',
    ];
    return shouldBeDeps.includes(pkg);
  }
}

export default DependencyFixGenerator;
