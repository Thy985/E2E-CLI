/**
 * Diagnose Command
 */

import { DiagnoseOptions, Diagnosis, ProjectInfo, SkillContext } from '../../types';
import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { createSkillRegistry } from '../../skills/registry';
import { A11ySkill } from '../../skills/builtin/a11y';
import { E2ESkill } from '../../skills/builtin/e2e';
import { PerformanceSkill } from '../../skills/builtin/performance';
import { SecuritySkill } from '../../skills/builtin/security';
import { UIUXSkill } from '../../skills/builtin/ui-ux';
import { createReportGenerator } from '../../engines/report';
import { createModelClient } from '../../models';
import { createTools } from '../../tools';
import { createStorage } from '../../storage';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function diagnoseCommand(options: any) {
  const startTime = Date.now();
  
  // Initialize logger
  const logger = createLogger({
    level: options.verbose ? 'debug' : 'info',
    quiet: options.quiet,
  });

  // Initialize formatter
  const formatter = createFormatter({ quiet: options.quiet || options.ci });

  // CI mode adjustments
  const isCI = options.ci || process.env.CI === 'true';
  const outputFormat = isCI ? 'json' : (options.output || 'html');

  try {
    // Parse options
    const diagnoseOptions: DiagnoseOptions = {
      skills: options.skills?.split(',').map((s: string) => s.trim()) || ['e2e', 'a11y', 'performance', 'security'],
      path: options.path || process.cwd(),
      url: options.url,
      output: outputFormat,
      outputFile: options.outputFile,
      failOn: options.failOn || 'critical',
      quiet: options.quiet || false,
      verbose: options.verbose || false,
      ci: isCI,
    };

    if (!isCI) {
      formatter.startSpinner('初始化诊断环境...');
    } else {
      console.log('::group::QA-Agent Diagnose');
    }

    // Get project info
    const projectInfo = await getProjectInfo(diagnoseOptions.path!);
    
    // Initialize skill registry
    const skillRegistry = createSkillRegistry(logger);
    
    // Register built-in skills
    skillRegistry.register(new A11ySkill());
    skillRegistry.register(new E2ESkill());
    skillRegistry.register(new PerformanceSkill());
    skillRegistry.register(new SecuritySkill());
    skillRegistry.register(new UIUXSkill());

    // Filter skills
    const skillsToRun = diagnoseOptions.skills?.filter(skill => skillRegistry.has(skill));
    
    if (!skillsToRun || skillsToRun.length === 0) {
      if (!isCI) {
        formatter.failSpinner('没有可用的诊断 Skills');
      } else {
        console.log('::error::没有可用的诊断 Skills');
      }
      process.exit(1);
    }

    if (!isCI) {
      formatter.updateSpinner(`运行诊断: ${skillsToRun.join(', ')}...`);
    }

    // Create skill context
    const context: SkillContext = {
      project: projectInfo,
      config: { enabled: true, options: {} },
      logger: logger.child('Skill'),
      tools: createTools(diagnoseOptions.path!),
      model: createModelClient(),
      storage: createStorage(),
    };

    // Initialize skills
    await skillRegistry.initializeAll(context);

    // Run diagnosis
    const results = await skillRegistry.runDiagnosis(skillsToRun, context);
    
    // Collect all issues
    const allIssues: Diagnosis[] = [];
    for (const [, issues] of results) {
      allIssues.push(...issues);
    }

    if (!isCI) {
      formatter.succeedSpinner(`诊断完成，发现 ${allIssues.length} 个问题`);
    } else {
      console.log(`诊断完成，发现 ${allIssues.length} 个问题`);
    }

    // Generate report
    const reportGenerator = createReportGenerator();
    const duration = Date.now() - startTime;
    const report = reportGenerator.generate(projectInfo, allIssues, duration);

    // Output report
    await outputReport(report, diagnoseOptions, formatter, reportGenerator);

    // Cleanup
    await skillRegistry.cleanupAll();

    // CI mode: output summary
    if (isCI) {
      console.log('::endgroup::');
      console.log('');
      console.log(`::notice::Score: ${report.summary.score}/100, Issues: ${report.summary.totalIssues}`);
      if (report.summary.critical > 0) {
        console.log(`::error::Found ${report.summary.critical} critical issues`);
      }
    }

    // Exit with appropriate code
    if (report.summary.critical > 0 && diagnoseOptions.failOn === 'critical') {
      process.exit(2);
    } else if (report.summary.totalIssues > 0 && diagnoseOptions.failOn === 'warning') {
      process.exit(1);
    }

    process.exit(0);

  } catch (error) {
    if (!isCI) {
      formatter.failSpinner('诊断失败');
      logger.error('诊断过程中发生错误:', error);
    } else {
      console.log('::error::诊断过程中发生错误');
      console.error(error);
    }
    process.exit(3);
  }
}

async function getProjectInfo(projectPath: string): Promise<ProjectInfo> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  let name = path.basename(projectPath);
  let type: ProjectInfo['type'] = 'webapp';
  let framework: string | undefined;

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    name = packageJson.name || name;

    // Detect framework
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.react) framework = 'react';
    else if (deps.vue) framework = 'vue';
    else if (deps.angular) framework = 'angular';
    else if (deps.svelte) framework = 'svelte';
    else if (deps.next) framework = 'next';
    else if (deps.nuxt) framework = 'nuxt';

    // Detect type
    if (deps.express || deps.fastify || deps.koa) type = 'api';
    else if (packageJson.bin) type = 'cli';
    else if (deps.typescript && !deps.react && !deps.vue) type = 'library';

  } catch {
    // package.json not found, use defaults
  }

  return {
    name,
    path: projectPath,
    type,
    framework,
  };
}

async function outputReport(
  report: any,
  options: DiagnoseOptions,
  formatter: ReturnType<typeof createFormatter>,
  reportGenerator: ReturnType<typeof createReportGenerator>
): Promise<void> {
  // Print summary to console
  if (!options.quiet) {
    formatter.printSummary(report.summary);
    formatter.printIssues(report.issues);
    console.log();
    console.log(`⏱️  耗时: ${report.duration}ms`);
  }

  // Format and save report
  let content: string;
  let extension: string;

  switch (options.output) {
    case 'json':
      content = reportGenerator.formatJSON(report);
      extension = 'json';
      break;
    case 'markdown':
      content = reportGenerator.formatMarkdown(report);
      extension = 'md';
      break;
    case 'compact':
      content = reportGenerator.formatCompact(report);
      extension = 'txt';
      break;
    case 'html':
    default:
      content = reportGenerator.formatHTML(report);
      extension = 'html';
  }

  // Output to file or stdout
  if (options.outputFile) {
    await fs.writeFile(options.outputFile, content, 'utf-8');
    if (!options.quiet) {
      formatter.success(`报告已保存: ${options.outputFile}`);
    }
  } else if (options.output === 'json' || options.quiet) {
    console.log(content);
  } else {
    // Save to default location
    const reportDir = path.join(options.path!, '.qa-agent', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    const reportPath = path.join(reportDir, `diagnose-${Date.now()}.${extension}`);
    await fs.writeFile(reportPath, content, 'utf-8');
    
    // Also save as latest
    const latestPath = path.join(reportDir, `latest.${extension}`);
    await fs.writeFile(latestPath, content, 'utf-8');
    
    if (!options.quiet) {
      formatter.success(`报告已保存: ${latestPath}`);
    }
  }
}
