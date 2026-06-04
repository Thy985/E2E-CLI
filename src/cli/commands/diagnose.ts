/**
 * Diagnose Command
 *
 * Thin wrapper over `core/runDiagnose`. CLI-only concerns live here:
 * formatter spinners, CI annotations, report file output, exit codes.
 */

import { DiagnoseOptions } from '../../types';
import { runDiagnose, cleanupDiagnose } from '../../core';
import { createLogger } from '../../utils/logger';
import { createFormatter } from '../output/formatter';
import { createReportGenerator } from '../../engines/report';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../../config';

export async function diagnoseCommand(options: any) {
  const startTime = Date.now();

  const logger = createLogger({
    level: options.verbose ? 'debug' : 'info',
    quiet: options.quiet,
  });

  const formatter = createFormatter({ quiet: options.quiet || options.ci });
  const isCI = options.ci || process.env.CI === 'true';
  const outputFormat = isCI ? 'json' : (options.output || 'html');

  let result: Awaited<ReturnType<typeof runDiagnose>> | null = null;
  try {
    const projectPath = options.path || process.cwd();
    const config = await loadConfig(projectPath);

    const diagnoseOptions: DiagnoseOptions = {
      skills: options.skills?.split(',').map((s: string) => s.trim()) ||
              config.skills?.enabled ||
              undefined,
      path: projectPath,
      url: options.url,
      output: outputFormat,
      outputFile: options.outputFile || config.output?.path,
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

    result = await runDiagnose(projectPath, config, {
      skills: diagnoseOptions.skills,
      level: options.verbose ? 'debug' : 'info',
    });

    const skillsToRun = Array.from(result.results.keys());
    if (skillsToRun.length === 0) {
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

    const allIssues = result.issues;
    if (!isCI) {
      formatter.succeedSpinner(`诊断完成，发现 ${allIssues.length} 个问题`);
    } else {
      console.log(`诊断完成，发现 ${allIssues.length} 个问题`);
    }

    const reportGenerator = createReportGenerator();
    const duration = Date.now() - startTime;
    const report = reportGenerator.generate(result.project, allIssues, duration);

    await outputReport(report, diagnoseOptions, formatter, reportGenerator);

    if (isCI) {
      console.log('::endgroup::');
      console.log('');
      console.log(`::notice::Score: ${report.summary.score}/100, Issues: ${report.summary.totalIssues}`);
      if (report.summary.critical > 0) {
        console.log(`::error::Found ${report.summary.critical} critical issues`);
      }
    }

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
  } finally {
    if (result) await cleanupDiagnose(result);
  }
}

async function outputReport(
  report: any,
  options: DiagnoseOptions,
  formatter: ReturnType<typeof createFormatter>,
  reportGenerator: ReturnType<typeof createReportGenerator>
): Promise<void> {
  if (!options.quiet) {
    formatter.printSummary(report.summary);
    formatter.printIssues(report.issues);
    console.log();
    console.log(`⏱️  耗时: ${report.duration}ms`);
  }

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

  if (options.outputFile) {
    let outputPath = options.outputFile;
    try {
      const stat = await fs.stat(outputPath);
      if (stat.isDirectory()) {
        outputPath = path.join(outputPath, `diagnose-${Date.now()}.${extension}`);
      }
    } catch {
      if (!path.extname(outputPath)) {
        await fs.mkdir(outputPath, { recursive: true });
        outputPath = path.join(outputPath, `diagnose-${Date.now()}.${extension}`);
      }
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
    if (!options.quiet) formatter.success(`报告已保存: ${outputPath}`);
  } else if (options.output === 'json' || options.quiet) {
    console.log(content);
  } else {
    const reportDir = path.join(options.path!, '.qa-agent', 'reports');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `diagnose-${Date.now()}.${extension}`);
    await fs.writeFile(reportPath, content, 'utf-8');
    const latestPath = path.join(reportDir, `latest.${extension}`);
    await fs.writeFile(latestPath, content, 'utf-8');
    if (!options.quiet) formatter.success(`报告已保存: ${latestPath}`);
  }
}
