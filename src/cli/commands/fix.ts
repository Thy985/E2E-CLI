/**
 * Fix Command
 * Automatically fixes diagnosed issues
 */

import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { createSkillRegistry } from '../../skills/registry';
import { A11ySkill } from '../../skills/builtin/a11y';
import { E2ESkill } from '../../skills/builtin/e2e';
import { PerformanceSkill } from '../../skills/builtin/performance';
import { SecuritySkill } from '../../skills/builtin/security';
import { UIUXSkill } from '../../skills/builtin/ui-ux';
import { createModelClient } from '../../models';
import { createTools } from '../../tools';
import { createStorage } from '../../storage';
import { Diagnosis, Fix, SkillContext } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

export interface FixOptions {
  report?: string;
  path?: string;
  interactive?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  skills?: string[];
  quiet?: boolean;
  verbose?: boolean;
}

export async function fixCommand(options: FixOptions) {
  const logger = createLogger({
    level: options.verbose ? 'debug' : 'info',
    quiet: options.quiet,
  });
  const formatter = createFormatter({ quiet: options.quiet });

  try {
    const projectPath = options.path || process.cwd();
    
    // Find the latest diagnosis report
    const reportPath = await findLatestReport(projectPath, options.report);
    
    if (!reportPath) {
      formatter.error('未找到诊断报告，请先运行 qa-agent diagnose');
      process.exit(1);
    }

    formatter.info(`加载诊断报告: ${reportPath}`);
    
    // Load report
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);
    
    // Filter auto-fixable issues
    const fixableIssues = report.issues.filter(
      (issue: Diagnosis) => issue.fixSuggestion?.autoApplicable
    );

    if (fixableIssues.length === 0) {
      formatter.success('没有可自动修复的问题');
      process.exit(0);
    }

    formatter.info(`发现 ${fixableIssues.length} 个可自动修复的问题`);

    // Initialize skill registry
    const skillRegistry = createSkillRegistry(logger);
    skillRegistry.register(new A11ySkill());
    skillRegistry.register(new E2ESkill());
    skillRegistry.register(new PerformanceSkill());
    skillRegistry.register(new SecuritySkill());
    skillRegistry.register(new UIUXSkill());

    // Create skill context
    const context: SkillContext = {
      project: report.project,
      config: { enabled: true, options: {} },
      logger: logger.child('Skill'),
      tools: createTools(),
      model: createModelClient(),
      storage: createStorage(),
    };

    await skillRegistry.initializeAll(context);

    // Group issues by skill
    const issuesBySkill = new Map<string, Diagnosis[]>();
    for (const issue of fixableIssues) {
      const skillName = issue.skill;
      if (!issuesBySkill.has(skillName)) {
        issuesBySkill.set(skillName, []);
      }
      issuesBySkill.get(skillName)!.push(issue);
    }

    // Generate fixes
    const fixes: Array<{ fix: Fix; issue: Diagnosis }> = [];
    
    for (const [skillName, issues] of issuesBySkill) {
      const skill = skillRegistry.get(skillName);
      if (!skill || !skill.fix) continue;

      formatter.info(`生成修复: ${skillName} (${issues.length} 个问题)`);

      for (const issue of issues) {
        try {
          const fix = await skill.fix(issue, context);
          fixes.push({ fix, issue });
        } catch (error) {
          logger.warn(`无法修复 ${issue.id}: ${error}`);
        }
      }
    }

    if (fixes.length === 0) {
      formatter.warn('没有生成任何修复');
      process.exit(0);
    }

    // Display fixes
    console.log('');
    displayFixes(fixes, formatter);

    // Dry run mode
    if (options.dryRun) {
      console.log('');
      formatter.info('干运行模式，不应用修改');
      process.exit(0);
    }

    // Interactive mode - ask for confirmation
    if (!options.yes) {
      const confirmed = await confirmFixes(fixes.length, formatter);
      if (!confirmed) {
        formatter.info('已取消修复');
        process.exit(0);
      }
    }

    // Apply fixes
    formatter.startSpinner('应用修复...');
    
    let applied = 0;
    let failed = 0;

    for (const { fix, issue } of fixes) {
      try {
        await applyFix(fix, projectPath);
        applied++;
        logger.debug(`已修复: ${issue.title}`);
      } catch (error) {
        failed++;
        logger.error(`修复失败: ${issue.title} - ${error}`);
      }
    }

    formatter.succeedSpinner(`已应用 ${applied} 个修复`);
    
    if (failed > 0) {
      formatter.warn(`${failed} 个修复失败`);
    }

    // Cleanup
    await skillRegistry.cleanupAll();

    // Suggest verification
    console.log('');
    formatter.info('建议运行 qa-agent diagnose 验证修复效果');

    process.exit(0);

  } catch (error) {
    formatter.failSpinner('修复失败');
    logger.error('修复过程中发生错误:', error);
    process.exit(3);
  }
}

async function findLatestReport(
  projectPath: string,
  specifiedPath?: string
): Promise<string | null> {
  if (specifiedPath) {
    return specifiedPath;
  }

  // Look for JSON report
  const reportDir = path.join(projectPath, '.qa-agent', 'reports');
  
  try {
    const files = await fs.readdir(reportDir);
    const jsonReports = files
      .filter(f => f.startsWith('diagnose-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (jsonReports.length > 0) {
      return path.join(reportDir, jsonReports[0]);
    }

    // If no JSON, check for latest.txt and convert
    const latestTxt = path.join(reportDir, 'latest.txt');
    const exists = await fs.access(latestTxt).then(() => true).catch(() => false);
    if (exists) {
      // Need to re-run diagnose to get JSON
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

function displayFixes(
  fixes: Array<{ fix: Fix; issue: Diagnosis }>,
  formatter: ReturnType<typeof createFormatter>
): void {
  console.log('将要应用的修复:');
  console.log('─'.repeat(60));

  for (const { fix, issue } of fixes) {
    console.log(`\n📌 ${issue.title}`);
    console.log(`   文件: ${issue.location.file}`);
    console.log(`   修复: ${fix.description}`);
    
    if (fix.changes.length > 0) {
      const change = fix.changes[0];
      if (change.oldContent && change.content) {
        console.log(`   - ${change.oldContent.slice(0, 50)}...`);
        console.log(`   + ${change.content.slice(0, 50)}...`);
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
}

async function confirmFixes(
  count: number,
  formatter: ReturnType<typeof createFormatter>
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n确认应用 ${count} 个修复? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function applyFix(fix: Fix, projectPath: string): Promise<void> {
  for (const change of fix.changes) {
    // Determine the correct file path
    let filePath: string;
    if (path.isAbsolute(change.file)) {
      filePath = change.file;
    } else if (change.file.startsWith(projectPath) || change.file.includes('src/') || change.file.includes('src\\')) {
      // File path is already relative to CWD or contains src/
      filePath = change.file;
    } else {
      filePath = path.join(projectPath, change.file);
    }

    switch (change.type) {
      case 'replace':
        if (change.oldContent && change.content) {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const newContent = fileContent.replace(change.oldContent, change.content);
          await fs.writeFile(filePath, newContent, 'utf-8');
        }
        break;

      case 'insert':
        if (change.content && change.position) {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const lines = fileContent.split('\n');
          lines.splice(change.position.line - 1, 0, change.content);
          await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
        }
        break;

      case 'delete':
        // Handle deletion if needed
        break;
    }
  }
}
