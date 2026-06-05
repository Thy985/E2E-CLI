/**
 * SkillManager
 *
 * 负责 skill 生命周期的外观层（facade）。原本是 758 行的上帝类，
 * 现在拆成三个职责单一的协作对象：
 *
 *   - SkillStore      本地注册表（.qa-agent/skills-config.json + 目录管理）
 *   - SkillPackager   从 npm registry 下载/解压（用 spawn + argv，禁 shell 注入）
 *   - SkillGenerator  从模板生成新 skill
 *
 * 对外保持与原 SkillManager 一致的 API，老调用方零修改。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { Logger, createLogger } from '../utils/logger';
import { InstalledSkill, SkillStore } from './skill-store';
import { SkillPackager } from './skill-packager';
import { SkillGenerator } from './skill-generator';

export type { InstalledSkill };

export interface SkillPackage {
  name: string;
  version: string;
  description: string;
  author?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string;
  downloads?: number;
}

export interface InstallOptions {
  version?: string;
  force?: boolean;
}

export interface SkillTemplate {
  name: string;
  description: string;
  category: string;
  files: Record<string, string>;
}

export class SkillManager {
  private readonly logger: Logger;
  private readonly store: SkillStore;
  private readonly packager: SkillPackager;
  private readonly generator: SkillGenerator;

  constructor(logger?: Logger, projectRoot?: string) {
    this.logger = logger ?? createLogger({ level: 'info' });
    this.store = new SkillStore(this.logger, projectRoot);
    this.packager = new SkillPackager(this.logger, this.store.directory);
    this.generator = new SkillGenerator(this.logger, this.store.directory);
  }

  /**
   * 列出已安装的 skill。
   */
  listInstalled(): Promise<InstalledSkill[]> {
    return this.store.listInstalled();
  }

  /**
   * 从 npm 安装一个 skill。
   *
   * 安全说明：npm 完整包名先经过 PACKAGE_NAME_RE 白名单校验，version 也走 VERSION_RE。
   * 任何 shell 元字符都会被拒绝，从而彻底消除命令注入。
   */
  async install(
    packageName: string,
    options: InstallOptions = {}
  ): Promise<{ success: boolean; message: string; skill?: InstalledSkill }> {
    if (!packageName || packageName.trim() === '') {
      return { success: false, message: 'Package name is required' };
    }

    const fullName = this.normalizePackageName(packageName);
    this.logger.info(`Installing skill: ${fullName}`);

    const existing = await this.store.find(packageName) ?? await this.store.find(fullName);
    if (existing && !options.force) {
      return {
        success: false,
        message: `Skill "${packageName}" is already installed (${existing.version}). Use --force to reinstall.`,
      };
    }

    const info = await this.packager.fetchPackageInfo(fullName);
    if (!info.exists) {
      return {
        success: false,
        message: `Skill "${fullName}" not found on npm registry.`,
      };
    }

    let downloaded;
    try {
      downloaded = await this.packager.downloadAndExtract(fullName, {
        version: options.version,
        force: options.force,
      });
    } catch (err) {
      return {
        success: false,
        message: `Failed to download skill "${fullName}": ${(err as Error).message}`,
      };
    }

    // 把临时解压目录搬到正式位置
    const targetPath = path.join(this.store.directory, this.skillNameFromPackage(downloaded));
    if (existing) {
      await fsp.rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
    }
    await this.copyDir(downloaded.extractedPath, targetPath);

    const skill: InstalledSkill = {
      name: downloaded.manifest.name,
      version: downloaded.manifest.version,
      path: targetPath,
      description: downloaded.manifest.description ?? info.description ?? '',
      author: downloaded.manifest.author
        ? this.authorToString(downloaded.manifest.author)
        : info.author,
      enabled: true,
      installedAt: new Date().toISOString(),
    };
    await this.store.add(skill);

    this.logger.info(`Skill "${skill.name}" v${skill.version} installed`);
    return {
      success: true,
      message: `Skill "${skill.name}" v${skill.version} installed successfully`,
      skill,
    };
  }

  /**
   * 更新一个或全部 skill。
   */
  async update(skillName?: string): Promise<{ success: boolean; message: string; updated?: string[] }> {
    const installed = await this.store.listInstalled();
    if (skillName) {
      const target = installed.find((s) => s.name === skillName);
      if (!target) {
        return { success: false, message: `Skill "${skillName}" not found` };
      }
      const result = await this.updateOne(target);
      return {
        success: result.success,
        message: result.message,
        updated: result.success ? [skillName] : undefined,
      };
    }

    const updated: string[] = [];
    for (const skill of installed) {
      const r = await this.updateOne(skill);
      if (r.success) updated.push(skill.name);
    }
    if (updated.length === 0) {
      return { success: true, message: 'No skills to update or all are at latest version' };
    }
    return { success: true, message: `Updated ${updated.length} skill(s): ${updated.join(', ')}`, updated };
  }

  /**
   * 从模板创建一个新 skill。
   */
  async create(
    name: string,
    options: { template?: string; description?: string } = {}
  ): Promise<{ success: boolean; message: string; path?: string }> {
    if (!name || name.trim() === '') {
      return { success: false, message: 'Skill name is required' };
    }
    const normalized = SkillGenerator.normalizeName(name);
    const existing = await this.store.find(normalized);
    if (existing) {
      return { success: false, message: `Skill "${normalized}" already exists` };
    }
    try {
      const result = await this.generator.generate(name, options);
      const skill: InstalledSkill = {
        name: result.name,
        version: '1.0.0',
        path: result.path,
        description: options.description || `Custom skill: ${result.name}`,
        enabled: true,
        installedAt: new Date().toISOString(),
      };
      await this.store.add(skill);
      return { success: true, message: `Skill "${result.name}" created`, path: result.path };
    } catch (err) {
      return { success: false, message: `Creation failed: ${(err as Error).message}` };
    }
  }

  /**
   * 删除一个 skill。
   */
  async remove(skillName: string): Promise<{ success: boolean; message: string }> {
    const removed = await this.store.remove(skillName);
    if (!removed) return { success: false, message: `Skill "${skillName}" not found` };
    return { success: true, message: `Skill "${skillName}" removed` };
  }

  /**
   * 启用/禁用一个 skill。
   */
  async toggle(
    skillName: string,
    enabled: boolean
  ): Promise<{ success: boolean; message: string }> {
    const updated = await this.store.setEnabled(skillName, enabled);
    if (!updated) return { success: false, message: `Skill "${skillName}" not found` };
    return {
      success: true,
      message: `Skill "${skillName}" ${enabled ? 'enabled' : 'disabled'}`,
    };
  }

  // ============= private helpers =============

  private async updateOne(
    skill: InstalledSkill
  ): Promise<{ success: boolean; message: string }> {
    const info = await this.packager.fetchPackageInfo(skill.name);
    if (!info.exists) {
      return { success: false, message: `Skill "${skill.name}" not found on npm` };
    }
    // 简单比较 semver：相同就不更
    if (info.version === skill.version) {
      return { success: true, message: `${skill.name} is already at latest version (${skill.version})` };
    }
    try {
      const downloaded = await this.packager.downloadAndExtract(skill.name);
      await fsp.rm(skill.path, { recursive: true, force: true }).catch(() => undefined);
      await this.copyDir(downloaded.extractedPath, skill.path);
      skill.version = downloaded.manifest.version;
      if (downloaded.manifest.description) skill.description = downloaded.manifest.description;
      await this.store.add(skill);
      return { success: true, message: `Updated ${skill.name} to v${skill.version}` };
    } catch (err) {
      return { success: false, message: `Update failed: ${(err as Error).message}` };
    }
  }

  private normalizePackageName(name: string): string {
    if (name.startsWith('@')) return name;
    if (name.startsWith('qa-agent-skill-')) return name;
    const body = name.startsWith('skill-') ? name : `skill-${name}`;
    return `@qa-agent/${body}`;
  }

  private skillNameFromPackage(downloaded: { manifest: { name: string } }): string {
    return downloaded.manifest.name.replace(/^@/, '').replace(/\//g, '-');
  }

  private authorToString(author: string | { name?: string } | undefined): string | undefined {
    if (!author) return undefined;
    if (typeof author === 'string') return author;
    return author.name;
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(s, d);
      } else if (entry.isFile()) {
        await fsp.copyFile(s, d);
      }
    }
  }
}

export default SkillManager;
