/**
 * Skill Registry - manages skill registration and discovery
 */

import { Skill, SkillContext, Diagnosis } from '../types';
import { BaseSkill } from './base-skill';
import { Logger } from '../utils/logger';

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  autoFixable: boolean;
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child('SkillRegistry');
  }

  /**
   * Register a skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      this.logger.warn(`Skill ${skill.name} already registered, overwriting`);
    }
    this.skills.set(skill.name, skill);
    this.logger.debug(`Registered skill: ${skill.name} v${skill.version}`);
  }

  /**
   * Unregister a skill
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Check if a skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get all registered skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all skill names
   */
  getNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get skill info for display
   */
  getInfo(name: string): SkillInfo | undefined {
    const skill = this.skills.get(name);
    if (!skill) return undefined;

    return {
      name: skill.name,
      version: skill.version,
      description: skill.description,
      capabilities: skill.capabilities.map(c => c.name),
      autoFixable: skill.capabilities.some(c => c.autoFixable),
    };
  }

  /**
   * Get all skills info
   */
  getAllInfo(): SkillInfo[] {
    return this.getNames().map(name => this.getInfo(name)!);
  }

  /**
   * Find skills matching an intent
   */
  findByIntent(intent: string): Skill[] {
    return this.getAll().filter(skill => 
      skill.matchesIntent ? skill.matchesIntent(intent) : this.defaultMatchIntent(skill, intent)
    );
  }

  /**
   * Default intent matching logic
   */
  private defaultMatchIntent(skill: Skill, intent: string): boolean {
    const lowerIntent = intent.toLowerCase();
    
    // Check skill name
    if (skill.name.toLowerCase().includes(lowerIntent)) {
      return true;
    }
    
    // Check triggers
    for (const trigger of skill.triggers) {
      if (trigger.type === 'keyword' || trigger.type === 'command') {
        const pattern = typeof trigger.pattern === 'string' 
          ? trigger.pattern.toLowerCase() 
          : trigger.pattern.source.toLowerCase();
        if (pattern.includes(lowerIntent) || lowerIntent.includes(pattern)) {
          return true;
        }
      }
    }
    
    // Check capabilities
    for (const cap of skill.capabilities) {
      if (cap.name.toLowerCase().includes(lowerIntent)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Run diagnosis for specific skills
   */
  async runDiagnosis(
    skillNames: string[],
    context: SkillContext
  ): Promise<Map<string, Diagnosis[]>> {
    const results = new Map<string, Diagnosis[]>();

    for (const name of skillNames) {
      const skill = this.skills.get(name);
      if (!skill) {
        this.logger.warn(`Skill not found: ${name}`);
        continue;
      }

      try {
        this.logger.debug(`Running diagnosis for skill: ${name}`);
        const diagnoses = await skill.diagnose(context);
        results.set(name, diagnoses);
        this.logger.debug(`Skill ${name} found ${diagnoses.length} issues`);
      } catch (error) {
        this.logger.error(`Skill ${name} diagnosis failed:`, error);
        results.set(name, []);
      }
    }

    return results;
  }

  /**
   * Initialize all skills
   */
  async initializeAll(context: SkillContext): Promise<void> {
    for (const skill of this.skills.values()) {
      if (skill.init) {
        try {
          await skill.init(context);
          this.logger.debug(`Initialized skill: ${skill.name}`);
        } catch (error) {
          this.logger.error(`Failed to initialize skill ${skill.name}:`, error);
        }
      }
    }
  }

  /**
   * Cleanup all skills
   */
  async cleanupAll(): Promise<void> {
    for (const skill of this.skills.values()) {
      if (skill.cleanup) {
        try {
          await skill.cleanup();
          this.logger.debug(`Cleaned up skill: ${skill.name}`);
        } catch (error) {
          this.logger.error(`Failed to cleanup skill ${skill.name}:`, error);
        }
      }
    }
  }

  /**
   * Get count of registered skills
   */
  get count(): number {
    return this.skills.size;
  }
}

/**
 * Create skill registry
 */
export function createSkillRegistry(logger: Logger): SkillRegistry {
  return new SkillRegistry(logger);
}
