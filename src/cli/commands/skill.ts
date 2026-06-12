/**
 * Skill Command
 * Handles skill lifecycle: list, install, update, create, remove, enable, disable
 */

import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { SkillManager } from '../../skills/skill-manager';

export const skillCommand = {
  /**
   * List all installed skills
   */
  list: async () => {
    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    const skills = await manager.listInstalled();

    formatter.header('已安装的 Skills');

    if (skills.length === 0) {
      formatter.info('没有安装任何 Skill');
      return;
    }

    console.log();
    console.log('┌────────────────┬─────────┬──────────────────────────────┬────────────┬────────┐');
    console.log('│ 名称           │ 版本    │ 描述                         │ 启用       │ 状态   │');
    console.log('├────────────────┼─────────┼──────────────────────────────┼────────────┼────────┤');

    for (const skill of skills) {
      const name = skill.name.padEnd(14);
      const version = skill.version.padEnd(7);
      const desc = (skill.description || 'No description').slice(0, 28).padEnd(28);
      const enabled = skill.enabled ? '✓' : '✗';
      const status = enabled === '✓' ? 'active ' : 'disabled';

      console.log(`│ ${name} │ ${version} │ ${desc} │ ${enabled.padEnd(10)} │ ${status.padEnd(7)} │`);
    }

    console.log('└────────────────┴─────────┴──────────────────────────────┴────────────┴────────┘');
    console.log();
    console.log(`共 ${skills.length} 个 Skills`);
  },

  /**
   * Install a skill from npm registry
   */
  install: async (name?: string) => {
    if (!name) {
      console.error('❌ 请指定要安装的 Skill 名称');
      console.log('用法: qa-agent skill install <skill-name>');
      process.exit(1);
    }

    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    formatter.info(`正在安装 Skill: ${name}`);
    
    const result = await manager.install(name);

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },

  /**
   * Update a skill or all skills
   */
  update: async (name?: string) => {
    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    if (name) {
      formatter.info(`正在更新 Skill: ${name}`);
    } else {
      formatter.info('正在更新所有 Skills...');
    }

    const result = await manager.update(name);

    if (result.success) {
      if (result.updated && result.updated.length > 0) {
        console.log(`✅ ${result.message}`);
      } else {
        console.log('📦 所有 Skills 已为最新版本');
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },

  /**
   * Create a new skill from template
   */
  create: async (name?: string, options?: { template?: string; description?: string }) => {
    if (!name) {
      console.error('❌ 请指定要创建的 Skill 名称');
      console.log('用法: qa-agent skill create <skill-name> [--description <描述>] [--template <模板>]');
      process.exit(1);
    }

    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    formatter.info(`正在创建 Skill: ${name}`);

    const result = await manager.create(name, options);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.path) {
        console.log(`📁 位置: ${result.path}`);
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },

  /**
   * Remove an installed skill
   */
  remove: async (name?: string) => {
    if (!name) {
      console.error('❌ 请指定要删除的 Skill 名称');
      console.log('用法: qa-agent skill remove <skill-name>');
      process.exit(1);
    }

    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    formatter.info(`正在删除 Skill: ${name}`);

    const result = await manager.remove(name);

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },

  /**
   * Enable a skill
   */
  enable: async (name?: string) => {
    if (!name) {
      console.error('❌ 请指定要启用的 Skill 名称');
      console.log('用法: qa-agent skill enable <skill-name>');
      process.exit(1);
    }

    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    formatter.info(`正在启用 Skill: ${name}`);

    const result = await manager.toggle(name, true);

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },

  /**
   * Disable a skill
   */
  disable: async (name?: string) => {
    if (!name) {
      console.error('❌ 请指定要禁用的 Skill 名称');
      console.log('用法: qa-agent skill disable <skill-name>');
      process.exit(1);
    }

    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const manager = new SkillManager(logger);

    formatter.info(`正在禁用 Skill: ${name}`);

    const result = await manager.toggle(name, false);

    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  },
};

/**
 * Legacy skill command handler (for backward compatibility)
 */
export async function skillCommandOld(action: string, name?: string) {
  const formatter = createFormatter();

  switch (action) {
    case 'list':
      await skillCommand.list();
      break;

    case 'install':
      if (!name) {
        formatter.error('请指定要安装的 Skill 名称');
        process.exit(1);
      }
      await skillCommand.install(name);
      break;

    case 'update':
      await skillCommand.update(name);
      break;

    case 'create':
      if (!name) {
        formatter.error('请指定要创建的 Skill 名称');
        process.exit(1);
      }
      await skillCommand.create(name);
      break;

    case 'remove':
      if (!name) {
        formatter.error('请指定要删除的 Skill 名称');
        process.exit(1);
      }
      await skillCommand.remove(name);
      break;

    case 'enable':
      if (!name) {
        formatter.error('请指定要启用的 Skill 名称');
        process.exit(1);
      }
      await skillCommand.enable(name);
      break;

    case 'disable':
      if (!name) {
        formatter.error('请指定要禁用的 Skill 名称');
        process.exit(1);
      }
      await skillCommand.disable(name);
      break;

    default:
      formatter.error(`未知操作: ${action}`);
      formatter.info('可用操作: list, install, update, create, remove, enable, disable');
      process.exit(1);
  }
}