/**
 * Init Command
 * Initialize QA-Agent configuration
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createFormatter } from '../output/formatter';
import { createDefaultConfig } from '../../config';

export interface InitOptions {
  format?: 'yaml' | 'json' | 'ts';
  force?: boolean;
}

export async function initCommand(options: InitOptions) {
  const formatter = createFormatter();
  const projectPath = process.cwd();

  formatter.header('初始化 QA-Agent 配置');

  // Check if config already exists
  const configFiles = [
    '.qa-agent/config.yaml',
    '.qa-agent/config.yml',
    '.qa-agent/config.json',
    'qa.config.ts',
    'qa.config.js',
    '.qarc.json',
  ];

  const existingConfig = await findExistingConfig(projectPath, configFiles);

  if (existingConfig && !options.force) {
    formatter.warn(`配置文件已存在: ${existingConfig}`);
    formatter.info('使用 --force 选项覆盖现有配置');
    return;
  }

  // Create config file
  const format = options.format || 'yaml';

  try {
    const configPath = await createDefaultConfig(projectPath, format);
    formatter.success(`配置文件已创建: ${configPath}`);
  } catch (error) {
    formatter.error(`创建配置文件失败: ${error}`);
    process.exit(1);
  }

  // Create .gitignore entries
  const gitignorePath = path.join(projectPath, '.gitignore');
  const gitignoreEntries = [
    '# QA-Agent',
    '.qa-agent/reports/',
    '.env',
  ];

  await ensureGitignore(gitignorePath, gitignoreEntries, formatter);

  // Create .env.example
  await ensureEnvExample(
    path.join(projectPath, '.env.example'),
    formatter
  );

  console.log();
  formatter.info('下一步:');
  console.log('  1. 编辑 .qa-agent/config.yaml 自定义配置');
  console.log('  2. 在 .env 中设置 MODEL_API_KEY');
  console.log('  3. 运行 qa-agent diagnose 开始诊断');
}

async function findExistingConfig(
  projectPath: string,
  configFiles: string[]
): Promise<string | undefined> {
  for (const f of configFiles) {
    try {
      await fs.access(path.join(projectPath, f));
      return f;
    } catch {
      // not found
    }
  }
  return undefined;
}

async function ensureGitignore(
  gitignorePath: string,
  entries: string[],
  formatter: ReturnType<typeof createFormatter>
): Promise<void> {
  let existing = '';
  try {
    existing = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // file does not exist
  }

  if (existing) {
    const missing = entries.filter((e) => !existing.includes(e));
    if (missing.length > 0) {
      await fs.appendFile(gitignorePath, '\n' + missing.join('\n') + '\n');
      formatter.success('已更新 .gitignore');
    }
  } else {
    await fs.writeFile(gitignorePath, entries.join('\n') + '\n');
    formatter.success('已创建 .gitignore');
  }
}

async function ensureEnvExample(
  envExamplePath: string,
  formatter: ReturnType<typeof createFormatter>
): Promise<void> {
  try {
    await fs.access(envExamplePath);
  } catch {
    await fs.writeFile(
      envExamplePath,
      `# QA-Agent API Key
# Get your API key from https://platform.deepseek.com/
MODEL_API_KEY=your-api-key-here
`
    );
    formatter.success('已创建 .env.example');
  }
}
