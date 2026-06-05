/**
 * SkillPackager
 * 处理从 npm registry 下载/解压 skill 包。
 *
 * 关键安全决策：
 * - 任何用户输入（package name / version）只作为 argv 单个 entry 传入，
 *   绝不走 shell 解析 → 修复之前 `execAsync(\`npm pack ${name}\`)` 的命令注入。
 * - tar 解压也走 argv 形式。
 * - 解压结果在临时目录中处理，落盘前调用方还要二次校验 package.json。
 */

import { execFileAsync } from '../utils/shell';
import { Logger } from '../utils/logger';

export interface NpmPackageInfo {
  exists: boolean;
  name: string;
  version: string;
  description?: string;
  author?: string;
}

export interface DownloadedSkill {
  /** npm 完整名（含 scope），例如 @qa-agent/skill-foo */
  fullName: string;
  version: string;
  /** 临时目录里已经解压好的路径 */
  extractedPath: string;
  /** 解压目录的 package.json 内容 */
  manifest: SkillManifest;
}

export interface SkillManifest {
  name: string;
  version: string;
  description?: string;
  author?: string | { name?: string };
  main?: string;
  keywords?: string[];
}

export class SkillPackager {
  private readonly logger: Logger;
  private readonly skillsDir: string;
  /** 可被 npm 接受的包名：scope 名 / 短名 / @scope/name；不允许任何 shell 元字符 */
  private static readonly PACKAGE_NAME_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
  private static readonly VERSION_RE = /^[a-zA-Z0-9][\w.\-+]*$/;

  constructor(logger: Logger, skillsDir: string) {
    this.logger = logger;
    this.skillsDir = skillsDir;
  }

  /**
   * 检查远端包是否存在并取得最新版本。
   */
  async fetchPackageInfo(packageName: string): Promise<NpmPackageInfo> {
    if (!SkillPackager.PACKAGE_NAME_RE.test(packageName)) {
      this.logger.warn(`Refusing to query npm for invalid package name: ${packageName}`);
      return { exists: false, name: packageName, version: '' };
    }

    try {
      const result = await execFileAsync(
        'npm',
        ['view', packageName, 'name', 'version', 'description', 'author', '--json'],
        { timeout: 30000 }
      );
      if (result.exitCode !== 0) {
        return { exists: false, name: packageName, version: '' };
      }
      const info = JSON.parse(result.stdout) as Partial<SkillManifest> & { error?: unknown };
      if (info.error) {
        return { exists: false, name: packageName, version: '' };
      }
      return {
        exists: true,
        name: info.name ?? packageName,
        version: info.version ?? '1.0.0',
        description: info.description,
        author: this.authorToString(info.author),
      };
    } catch (err) {
      this.logger.warn(`npm view failed for ${packageName}: ${(err as Error).message}`);
      return { exists: false, name: packageName, version: '' };
    }
  }

  /**
   * 把 `author` 字段统一成字符串。
   */
  private authorToString(author: unknown): string | undefined {
    if (!author) return undefined;
    if (typeof author === 'string') return author;
    if (typeof author === 'object' && 'name' in (author as Record<string, unknown>)) {
      return (author as { name?: string }).name;
    }
    return undefined;
  }

  /**
   * 完整安装：npm pack → 解析 tarball 路径 → 解压 → 返回元数据。
   * 调用方拿到结果后还需要把 extractedPath 移到目标位置 + 更新 store。
   */
  async downloadAndExtract(
    fullPackageName: string,
    options: { version?: string; force?: boolean } = {}
  ): Promise<DownloadedSkill> {
    if (!SkillPackager.PACKAGE_NAME_RE.test(fullPackageName)) {
      throw new Error(`Invalid package name: ${fullPackageName}`);
    }
    if (options.version && !SkillPackager.VERSION_RE.test(options.version)) {
      throw new Error(`Invalid version specifier: ${options.version}`);
    }

    const tempDir = `${this.skillsDir}/.tmp-${process.pid}-${Date.now()}`;
    await this.ensureDir(tempDir);

    try {
      // npm pack <name>[@<version>]，version 单独作为 argv
      const packArgs: string[] = options.version
        ? ['pack', `${fullPackageName}@${options.version}`, '--silent']
        : ['pack', fullPackageName, '--silent'];
      const packResult = await execFileAsync('npm', packArgs, {
        cwd: tempDir,
        timeout: 60000,
      });
      if (packResult.exitCode !== 0) {
        throw new Error(
          `npm pack failed for ${fullPackageName}: ${packResult.stderr || packResult.stdout}`
        );
      }

      // npm pack 把文件名打到 stdout —— 仍然只是文本解析，不是 shell
      const tarballName = packResult.stdout.split('\n').pop()?.trim();
      if (!tarballName || !tarballName.endsWith('.tgz')) {
        throw new Error(`npm pack returned no tarball for ${fullPackageName}`);
      }
      const tarballPath = `${tempDir}/${tarballName}`;

      await this.extractTarball(tarballPath, tempDir);

      // npm pack 总是解压到 "package/" 子目录（scoped 包是 "package/.../"）
      const extractedRoot = await this.findPackageRoot(tempDir);
      const manifestPath = `${extractedRoot}/package.json`;
      const manifest = await this.readManifest(manifestPath);

      return {
        fullName: fullPackageName,
        version: manifest.version,
        extractedPath: extractedRoot,
        manifest,
      };
    } finally {
      // 失败也要清临时目录
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  // ============= private helpers =============

  private async ensureDir(dir: string): Promise<void> {
    const { mkdir } = await import('fs/promises');
    await mkdir(dir, { recursive: true });
  }

  /**
   * 用 tar（POSIX 优先，Windows 上尝试内置 Expand-Archive 替代方案）。
   * 注意：tarballName / tempDir 都是我们自己拼出来的，**不**接受用户输入。
   */
  private async extractTarball(tarballPath: string, destDir: string): Promise<void> {
    if (process.platform === 'win32') {
      // Windows 自带 tar（Win10 1803+）；不再走 PowerShell Expand-Archive
      await execFileAsync('tar', ['-xzf', tarballPath, '-C', destDir], { timeout: 30000 });
    } else {
      await execFileAsync('tar', ['-xzf', tarballPath, '-C', destDir], { timeout: 30000 });
    }
  }

  private async findPackageRoot(tempDir: string): Promise<string> {
    const { readdir, stat } = await import('fs/promises');
    const entries = await readdir(tempDir);
    for (const entry of entries) {
      const candidate = `${tempDir}/${entry}`;
      const info = await stat(candidate).catch(() => null);
      if (!info?.isDirectory()) continue;
      // 跳过 npm 的 tarball 文件（同名的 .tgz）
      if (entry.endsWith('.tgz')) continue;
      // 优先找含 package.json 的目录
      try {
        await stat(`${candidate}/package.json`);
        return candidate;
      } catch {
        continue;
      }
    }
    throw new Error('Could not locate package.json in downloaded tarball');
  }

  private async readManifest(manifestPath: string): Promise<SkillManifest> {
    const { readFile } = await import('fs/promises');
    const raw = await readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as SkillManifest;
    if (!parsed.name || !parsed.version) {
      throw new Error('Downloaded package has invalid manifest (missing name or version)');
    }
    return parsed;
  }
}
