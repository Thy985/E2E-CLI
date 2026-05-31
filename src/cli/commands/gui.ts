/**
 * GUI Command
 * Browser automation and visual testing commands
 */

import { createFormatter } from '../output/formatter';
import { createModelClient } from '../../models';
import { GUIAgent } from '../../gui';
import { BrowserController } from '../../gui/browser';
import { Recorder } from '../../gui/recorder';
import { Player } from '../../gui/player';
import { ReportGenerator } from '../../gui/report';
import * as readline from 'readline';

export interface GUIOptions {
  url?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  timeout?: number;
}

export interface TestGUIOptions extends GUIOptions {
  scenario?: string;
  verify?: string;
}

export interface VisualGUIOptions extends GUIOptions {
  name?: string;
  baselineDir?: string;
  currentDir?: string;
  threshold?: number;
  selectors?: string;
  update?: boolean;
}

export interface ActGUIOptions extends GUIOptions {
  task?: string;
}

export interface RecordGUIOptions extends GUIOptions {
  output?: string;
  interactive?: boolean;
}

export interface PlayGUIOptions extends GUIOptions {
  file?: string;
  slowMo?: number;
  retry?: number;
}

export async function guiCommand(action: string, options: any) {
  const formatter = createFormatter();

  switch (action) {
    case 'test':
      await testCommand(options, formatter);
      break;
    case 'visual':
      await visualCommand(options, formatter);
      break;
    case 'act':
      await actCommand(options, formatter);
      break;
    case 'screenshot':
      await screenshotCommand(options, formatter);
      break;
    case 'record':
      await recordCommand(options, formatter);
      break;
    case 'play':
      await playCommand(options, formatter);
      break;
    case 'list':
      await listCommand(options, formatter);
      break;
    case 'export':
      await exportCommand(options, formatter);
      break;
    default:
      formatter.error(`未知操作: ${action}`);
      formatter.info('可用操作: test, visual, act, screenshot, record, play, list, export');
      process.exit(1);
  }
}

async function testCommand(options: TestGUIOptions & { report?: boolean }, formatter: ReturnType<typeof createFormatter>) {
  if (!options.url) {
    formatter.error('请指定 URL: --url <url>');
    process.exit(1);
  }

  if (!options.scenario) {
    formatter.error('请指定测试场景: --scenario <scenario>');
    process.exit(1);
  }

  formatter.header('E2E 测试');
  formatter.info(`URL: ${options.url}`);
  formatter.info(`场景: ${options.scenario}`);
  console.log();

  const agent = new GUIAgent({
    browser: options.browser || 'chromium',
    headless: options.headless ?? true,
    timeout: options.timeout || 60000,
  });

  try {
    formatter.info('启动浏览器...');
    await agent.launch();

    formatter.info('执行测试...');
    const result = await agent.runTest({
      url: options.url,
      scenario: options.scenario,
      verify: options.verify,
      timeout: options.timeout,
    });

    console.log();
    console.log('测试步骤:');
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      const status = step.success ? '✓' : '✗';
      console.log(`  ${status} ${i + 1}. ${step.action}`);
    }

    console.log();
    if (result.success) {
      formatter.success(`测试通过 (${result.duration}ms)`);
    } else {
      formatter.error(`测试失败 (${result.duration}ms)`);
      if (result.error) {
        formatter.error(result.error);
      }
    }

    // Generate report if requested
    if (options.report) {
      const reportGen = new ReportGenerator();
      const reportPath = await reportGen.generateTestReport(result, 'test');
      formatter.info(`报告已生成: ${reportPath}`);
    }

    if (!result.success) {
      process.exit(1);
    }
  } finally {
    await agent.close();
  }
}

async function visualCommand(options: VisualGUIOptions, formatter: ReturnType<typeof createFormatter>) {
  if (!options.url) {
    formatter.error('请指定 URL: --url <url>');
    process.exit(1);
  }

  if (!options.name) {
    formatter.error('请指定测试名称: --name <name>');
    process.exit(1);
  }

  formatter.header('视觉回归测试');
  formatter.info(`URL: ${options.url}`);
  formatter.info(`名称: ${options.name}`);
  console.log();

  const agent = new GUIAgent({
    browser: options.browser || 'chromium',
    headless: options.headless ?? true,
  });

  try {
    formatter.info('启动浏览器...');
    await agent.launch();

    formatter.info('执行视觉测试...');
    const result = await agent.runVisualTest({
      url: options.url,
      name: options.name,
      baselineDir: options.baselineDir,
      currentDir: options.currentDir,
      threshold: options.threshold ? options.threshold / 100 : 0.1,
      selectors: options.selectors?.split(','),
    });

    console.log();
    console.log('对比结果:');
    for (const r of result.results) {
      const status = r.match ? '✓' : '✗';
      const diff = r.diffPercentage.toFixed(2);
      console.log(`  ${status} ${r.name}: ${diff}% 差异`);
      if (r.selector) {
        console.log(`    选择器: ${r.selector}`);
      }
    }

    console.log();
    if (result.passed) {
      formatter.success(`视觉测试通过 (${result.duration}ms)`);
    } else {
      formatter.error(`视觉测试失败 (${result.duration}ms)`);
      process.exit(1);
    }
  } finally {
    await agent.close();
  }
}

async function actCommand(options: ActGUIOptions, formatter: ReturnType<typeof createFormatter>) {
  if (!options.url) {
    formatter.error('请指定 URL: --url <url>');
    process.exit(1);
  }

  if (!options.task) {
    formatter.error('请指定任务: --task <task>');
    process.exit(1);
  }

  formatter.header('智能 UI 操作');
  formatter.info(`URL: ${options.url}`);
  formatter.info(`任务: ${options.task}`);
  console.log();

  const agent = new GUIAgent({
    browser: options.browser || 'chromium',
    headless: options.headless ?? false, // Default to visible for interactive
    timeout: options.timeout || 60000,
  });

  try {
    formatter.info('启动浏览器...');
    await agent.launch();

    formatter.info('执行任务...');
    const result = await agent.execute({
      url: options.url,
      task: options.task,
      timeout: options.timeout,
    });

    console.log();
    console.log('执行步骤:');
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      const status = step.success ? '✓' : '✗';
      console.log(`  ${status} ${i + 1}. ${step.description}`);
    }

    console.log();
    if (result.success) {
      formatter.success(`任务完成 (${result.duration}ms)`);
    } else {
      formatter.error(`任务失败 (${result.duration}ms)`);
      process.exit(1);
    }
  } finally {
    await agent.close();
  }
}

async function screenshotCommand(options: GUIOptions, formatter: ReturnType<typeof createFormatter>) {
  if (!options.url) {
    formatter.error('请指定 URL: --url <url>');
    process.exit(1);
  }

  formatter.header('截图');
  formatter.info(`URL: ${options.url}`);
  console.log();

  const agent = new GUIAgent({
    browser: options.browser || 'chromium',
    headless: options.headless ?? true,
  });

  try {
    formatter.info('启动浏览器...');
    await agent.launch();

    formatter.info('导航到页面...');
    await agent.navigate(options.url);

    formatter.info('截取页面...');
    const screenshot = await agent.screenshot({ fullPage: true });

    const filename = `screenshot-${Date.now()}.png`;
    const filepath = `.qa-agent/screenshots/${filename}`;
    
    // Save screenshot
    const fs = await import('fs');
    const dir = '.qa-agent/screenshots';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filepath, screenshot);

    formatter.success(`截图已保存: ${filepath}`);
  } finally {
    await agent.close();
  }
}

async function recordCommand(options: RecordGUIOptions, formatter: ReturnType<typeof createFormatter>) {
  if (!options.url) {
    formatter.error('请指定 URL: --url <url>');
    process.exit(1);
  }

  formatter.header('录制操作');
  formatter.info(`URL: ${options.url}`);
  formatter.info('按 Ctrl+C 停止录制');
  console.log();

  const browser = new BrowserController({
    browser: options.browser || 'chromium',
    headless: false, // Always show browser for recording
  });

  const recorder = new Recorder(browser, {
    outputDir: options.output,
    autoScreenshot: true,
  });

  try {
    formatter.info('启动浏览器...');
    await browser.launch();

    formatter.info('开始录制...');
    await recorder.start(options.url);

    // Interactive mode - wait for user commands
    if (options.interactive) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log();
      console.log('交互模式命令:');
      console.log('  click <selector>  - 记录点击');
      console.log('  type <selector> <text> - 记录输入');
      console.log('  wait <selector>   - 记录等待');
      console.log('  done              - 结束录制');
      console.log();

      const promptCommand = () => {
        rl.question('> ', async (input) => {
          const parts = input.trim().split(' ');
          const cmd = parts[0];

          try {
            switch (cmd) {
              case 'click':
                if (parts[1]) {
                  await recorder.recordClick(parts[1]);
                  console.log(`  ✓ 已记录点击: ${parts[1]}`);
                }
                break;
              case 'type':
                if (parts[1] && parts[2]) {
                  const text = parts.slice(2).join(' ');
                  await recorder.recordInput(parts[1], text);
                  console.log(`  ✓ 已记录输入: ${parts[1]} = "${text}"`);
                }
                break;
              case 'wait':
                if (parts[1]) {
                  await recorder.recordWait(parts[1]);
                  console.log(`  ✓ 已记录等待: ${parts[1]}`);
                }
                break;
              case 'done':
                rl.close();
                return;
              default:
                console.log('  未知命令');
            }
          } catch (error) {
            console.log(`  ✗ 错误: ${error}`);
          }

          promptCommand();
        });
      };

      await new Promise<void>((resolve) => {
        rl.on('close', () => {
          resolve();
        });
        promptCommand();
      });
    } else {
      // Wait for Ctrl+C
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          resolve();
        });
      });
    }

    // Stop recording
    const recording = await recorder.stop();
    
    console.log();
    formatter.success(`录制已保存: .qa-agent/recordings/${recording.id}.json`);
    formatter.info(`共记录 ${recording.steps.length} 个步骤`);
  } finally {
    await browser.close();
  }
}

async function playCommand(options: PlayGUIOptions, formatter: ReturnType<typeof createFormatter>) {
  if (!options.file) {
    formatter.error('请指定录制文件: --file <path>');
    process.exit(1);
  }

  const fs = await import('fs');
  if (!fs.existsSync(options.file)) {
    formatter.error(`文件不存在: ${options.file}`);
    process.exit(1);
  }

  formatter.header('回放录制');
  formatter.info(`文件: ${options.file}`);
  console.log();

  const browser = new BrowserController({
    browser: options.browser || 'chromium',
    headless: options.headless ?? false,
    timeout: options.timeout || 60000,
  });

  const player = new Player(browser, {
    slowMo: options.slowMo,
    retryCount: options.retry || 3,
    screenshotOnFailure: true,
  });

  try {
    formatter.info('加载录制...');
    const recording = await Recorder.load(options.file);

    // Validate recording
    const validation = Player.validate(recording);
    if (!validation.valid) {
      formatter.error('录制文件无效:');
      validation.errors.forEach(e => formatter.error(`  - ${e}`));
      process.exit(1);
    }

    formatter.info(`录制 ID: ${recording.id}`);
    formatter.info(`步骤数: ${recording.steps.length}`);
    console.log();

    formatter.info('启动浏览器...');
    await browser.launch();

    formatter.info('执行回放...');
    const result = await player.playWithRetry(recording);

    console.log();
    console.log('回放结果:');
    console.log(`  执行步骤: ${result.executedSteps}/${result.totalSteps}`);
    console.log(`  耗时: ${result.duration}ms`);

    if (result.success) {
      formatter.success('回放成功');
    } else {
      formatter.error('回放失败');
      result.errors.forEach(e => {
        console.log(`  ✗ 步骤 ${e.stepIndex + 1}: ${e.error}`);
      });
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

async function listCommand(options: any, formatter: ReturnType<typeof createFormatter>) {
  formatter.header('录制列表');
  console.log();

  const recordings = await Recorder.list();

  if (recordings.length === 0) {
    formatter.info('暂无录制文件');
    formatter.info('使用 qa-agent gui record --url <url> 创建录制');
    return;
  }

  console.log(`找到 ${recordings.length} 个录制:`);
  console.log();

  for (const filepath of recordings) {
    const recording = await Recorder.load(filepath);
    console.log(`  ${recording.id}`);
    console.log(`    URL: ${recording.url}`);
    console.log(`    步骤: ${recording.steps.length}`);
    console.log(`    创建: ${recording.createdAt.toLocaleString()}`);
    console.log();
  }
}

async function exportCommand(options: { file?: string; format?: string }, formatter: ReturnType<typeof createFormatter>) {
  if (!options.file) {
    formatter.error('请指定录制文件: --file <path>');
    process.exit(1);
  }

  const format = options.format || 'playwright';
  if (!['json', 'yaml', 'playwright'].includes(format)) {
    formatter.error(`不支持的格式: ${format}`);
    formatter.info('支持格式: json, yaml, playwright');
    process.exit(1);
  }

  const fs = await import('fs');
  if (!fs.existsSync(options.file)) {
    formatter.error(`文件不存在: ${options.file}`);
    process.exit(1);
  }

  const recording = await Recorder.load(options.file);
  const output = await Recorder.export(recording, format as 'json' | 'yaml' | 'playwright');

  const outputPath = options.file.replace('.json', `.${format === 'playwright' ? 'spec.ts' : format}`);
  await fs.promises.writeFile(outputPath, output);

  formatter.success(`已导出到: ${outputPath}`);
}
