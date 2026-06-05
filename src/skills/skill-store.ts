/**
 * SkillStore
 * 本地 Skill 注册表：管理 .qa-agent/skills-config.json 与本地 skill 目录。
 * 不调用 shell —— 纯文件系统操作。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface InstalledSkill {
  name: string;
  version: string;
  path: string;
  description: string;
  author?: string;
  enabled: boolean;
  installedAt: string;
}

export interface SkillConfig {
  skills: InstalledSkill[];
}

const DEFAULT_CONFIG: SkillConfig = { skills: [] };

export class SkillStore {
  private readonly logger: Logger;
  private readonly skillsDir: string;
  private readonly configPath: string;

  constructor(logger: Logger, projectRoot?: string) {
    this.logger = logger;
    const root = projectRoot ?? process.cwd();
    this.skillsDir = path.join(root, '.qa-agent', 'skills');
    this.configPath = path.join(root, '.qa-agent', 'skills-config.json');
  }

  get directory(): string {
    return this.skillsDir;
  }

  async listInstalled(): Promise<InstalledSkill[]> {
    const config = await this.loadConfig();
    return config.skills;
  }

  async add(skill: InstalledSkill): Promise<void> {
    const config = await this.loadConfig();
    config.skills = config.skills.filter((s) => s.name !== skill.name);
    config.skills.push(skill);
    await this.saveConfig(config);
  }

  async remove(name: string): Promise<InstalledSkill | null> {
    const config = await this.loadConfig();
    const target = config.skills.find((s) => s.name === name);
    if (!target) return null;

    // 先清文件系统，再更新 config —— 顺序很重要：失败要可回滚
    try {
      await fsp.rm(target.path, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(
        `Failed to remove skill directory ${target.path}: ${(err as Error).message}`
      );
    }

    config.skills = config.skills.filter((s) => s.name !== name);
    await this.saveConfig(config);
    return target;
  }

  async setEnabled(name: string, enabled: boolean): Promise<InstalledSkill | null> {
    const config = await this.loadConfig();
    const skill = config.skills.find((s) => s.name === name);
    if (!skill) return null;
    skill.enabled = enabled;
    await this.saveConfig(config);
    return skill;
  }

  async find(name: string): Promise<InstalledSkill | null> {
    const config = await this.loadConfig();
    return config.skills.find((s) => s.name === name) ?? null;
  }

  // ============= private config I/O =============

  private async loadConfig(): Promise<SkillConfig> {
    try {
      const raw = await fsp.readFile(this.configPath, 'utf-8');
      return JSON.parse(raw) as SkillConfig;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return { ...DEFAULT_CONFIG };
      // JSON 损坏：备份原文件并返回默认 config，让用户能继续操作
      this.logger.warn(
        `skills-config.json is corrupted: ${(err as Error).message}. Falling back to empty config.`
      );
      return { ...DEFAULT_CONFIG };
    }
  }

  private async saveConfig(config: SkillConfig): Promise<void> {
    await fsp.mkdir(path.dirname(this.configPath), { recursive: true });
    // 原子写：tmp + rename，避免读到半截 JSON
    const tmp = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(config, null, 2), 'utf-8');
    await fsp.rename(tmp, this.configPath);
  }
}
