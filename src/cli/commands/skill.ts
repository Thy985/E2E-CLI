/**
 * Skill Command
 */

import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { createSkillRegistry } from '../../skills/registry';
import { A11ySkill } from '../../skills/builtin/a11y';
import { E2ESkill } from '../../skills/builtin/e2e';
import { PerformanceSkill } from '../../skills/builtin/performance';
import { SecuritySkill } from '../../skills/builtin/security';
import { UIUXSkill } from '../../skills/builtin/ui-ux';

export const skillCommand = {
  list: async () => {
    const logger = createLogger({ level: 'info' });
    const formatter = createFormatter();
    const skillRegistry = createSkillRegistry(logger);
    skillRegistry.register(new A11ySkill());
    skillRegistry.register(new E2ESkill());
    skillRegistry.register(new PerformanceSkill());
    skillRegistry.register(new SecuritySkill());
    skillRegistry.register(new UIUXSkill());
    await listSkills(skillRegistry, formatter);
  },
  install: async (name?: string) => {
    const formatter = createFormatter();
    formatter.info(`Installing Skill: ${name || 'not specified'}`);
    formatter.info('Please wait for next version update');
  },
  update: async (name?: string) => {
    const formatter = createFormatter();
    formatter.info(`Updating Skill: ${name || 'all'}`);
    formatter.info('Please wait for next version update');
  },
  create: async (name?: string) => {
    const formatter = createFormatter();
    formatter.info(`Creating Skill: ${name || 'not specified'}`);
    formatter.info('Please wait for next version update');
  },
};

export async function skillCommandOld(action: string, name?: string) {
  const logger = createLogger({ level: 'info' });
  const formatter = createFormatter();

  const skillRegistry = createSkillRegistry(logger);
  skillRegistry.register(new A11ySkill());
  skillRegistry.register(new E2ESkill());
  skillRegistry.register(new PerformanceSkill());
  skillRegistry.register(new SecuritySkill());
  skillRegistry.register(new UIUXSkill());

  switch (action) {
    case 'list':
      await listSkills(skillRegistry, formatter);
      break;
    
    case 'install':
      formatter.info(`安装 Skill: ${name || '未指定'}`);
      formatter.info('请等待下一版本更新');
      break;
    
    case 'update':
      formatter.info(`更新 Skill: ${name || '全部'}`);
      formatter.info('请等待下一版本更新');
      break;
    
    case 'create':
      formatter.info(`创建 Skill: ${name || '未指定'}`);
      formatter.info('请等待下一版本更新');
      break;
    
    default:
      formatter.error(`未知操作: ${action}`);
      formatter.info('可用操作: list, install, update, create');
      process.exit(1);
  }
}

async function listSkills(
  skillRegistry: ReturnType<typeof createSkillRegistry>,
  formatter: ReturnType<typeof createFormatter>
) {
  const skills = skillRegistry.getAllInfo();

  formatter.header('已安装的 Skills');
  
  if (skills.length === 0) {
    formatter.info('没有安装任何 Skill');
    return;
  }

  console.log();
  console.log('┌────────────────┬─────────┬──────────────────────────────┬────────────┐');
  console.log('│ 名称           │ 版本    │ 描述                         │ 自动修复   │');
  console.log('├────────────────┼─────────┼──────────────────────────────┼────────────┤');
  
  for (const skill of skills) {
    const name = skill.name.padEnd(14);
    const version = skill.version.padEnd(7);
    const desc = skill.description.slice(0, 28).padEnd(28);
    const autoFix = skill.autoFixable ? '✓' : '✗';
    
    console.log(`│ ${name} │ ${version} │ ${desc} │ ${autoFix.padEnd(10)} │`);
  }
  
  console.log('└────────────────┴─────────┴──────────────────────────────┴────────────┘');
  console.log();
  console.log(`共 ${skills.length} 个 Skills`);
}
