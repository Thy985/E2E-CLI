/**
 * SkillGenerator
 * 从模板生成一个全新的 skill 目录。不调 shell，只写文件。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface GeneratorOptions {
  template?: string;
  description?: string;
}

export interface GeneratorResult {
  path: string;
  name: string;
}

export class SkillGenerator {
  private readonly logger: Logger;
  private readonly skillsDir: string;

  constructor(logger: Logger, skillsDir: string) {
    this.logger = logger;
    this.skillsDir = skillsDir;
  }

  /**
   * 把任意字符串归一化为 kebab-case，作为 skill 名 / 文件名前缀。
   * 例：`"My Cool Skill!"` → `"my-cool-skill"`
   */
  static normalizeName(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 模板名 → class 名（CamelCase + Skill 后缀）。
   */
  static toClassName(raw: string): string {
    return raw
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') + 'Skill';
  }

  async generate(rawName: string, options: GeneratorOptions = {}): Promise<GeneratorResult> {
    const name = SkillGenerator.normalizeName(rawName);
    if (!name) {
      throw new Error('Skill name is required');
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`Skill name must be lowercase kebab-case, got "${name}"`);
    }

    const description = options.description || `Custom skill: ${name}`;
    const template = options.template || 'basic';
    const skillPath = path.join(this.skillsDir, name);

    try {
      await fsp.access(skillPath);
      throw new Error(`Directory "${skillPath}" already exists`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    try {
      await fsp.mkdir(path.join(skillPath, 'checkers'), { recursive: true });
      await fsp.mkdir(path.join(skillPath, 'fixers'), { recursive: true });

      const files = this.buildTemplate(name, rawName, description, template);
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(skillPath, relPath);
        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.writeFile(fullPath, content, 'utf-8');
      }

      this.logger.info(`Skill "${name}" scaffold created at ${skillPath}`);
      return { path: skillPath, name };
    } catch (err) {
      // 失败时回滚半成品
      try {
        await fsp.rm(skillPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  // ============= template =============

  private buildTemplate(
    name: string,
    displayName: string,
    description: string,
    template: string
  ): Record<string, string> {
    const className = SkillGenerator.toClassName(displayName);
    const packageName = `@qa-agent/skill-${name}`;

    return {
      'package.json': JSON.stringify(
        {
          name: packageName,
          version: '1.0.0',
          description,
          main: 'index.ts',
          keywords: ['qa-agent', 'skill'],
          author: '',
          license: 'MIT',
        },
        null,
        2
      ),

      'index.ts': `/**
 * ${displayName} Skill
 * ${description}
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  SkillTrigger,
  SkillCapability,
} from '../../../types';
import { generateId } from '../../../utils';

export class ${className} extends BaseSkill {
  name = '${name}';
  version = '1.0.0';
  description = ${JSON.stringify(description)};

  triggers: SkillTrigger[] = [
    { type: 'command', pattern: '${name}' },
    { type: 'keyword', pattern: /${name}|${displayName}/i },
  ];

  capabilities: SkillCapability[] = [
    {
      name: 'diagnosis',
      description: 'Performs ${name} diagnosis',
      autoFixable: true,
      riskLevel: 'low',
    },
  ];

  async diagnose(_context: SkillContext): Promise<Diagnosis[]> {
    // TODO: implement your diagnosis logic
    return [];
  }

  async fix(diagnosis: Diagnosis, _context: SkillContext): Promise<Fix> {
    return {
      id: \`Fix-\${generateId()}\`,
      diagnosisId: diagnosis.id,
      description: \`Fix for \${diagnosis.title}\`,
      changes: [],
      riskLevel: 'low',
      autoApplicable: true,
    };
  }
}

export default ${className};
`,

      'checkers/README.md': `# ${displayName} Checkers\n\nAdd your checker modules here.\n`,

      'fixers/README.md': `# ${displayName} Fixers\n\nAdd your fixer modules here.\n`,

      'README.md': `# ${displayName}\n\n${description}\n\n## Usage\n\n\`\`\`bash\nqa-agent diagnose --skills ${name}\n\`\`\`\n`,

      // 模板版本号方便将来扩展多种模板
      '.template': template,
    };
  }
}
