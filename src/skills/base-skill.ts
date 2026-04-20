/**
 * Base Skill implementation
 */

import {
  Skill,
  SkillContext,
  Diagnosis,
  Fix,
  Verification,
  SkillTrigger,
  SkillCapability,
} from '../types';

export abstract class BaseSkill implements Skill {
  abstract name: string;
  abstract version: string;
  abstract description: string;
  abstract triggers: SkillTrigger[];
  abstract capabilities: SkillCapability[];

  async init?(context: SkillContext): Promise<void>;

  abstract diagnose(context: SkillContext): Promise<Diagnosis[]>;

  async fix?(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    throw new Error(`Skill ${this.name} does not support auto-fix`);
  }

  async verify?(fix: Fix, _context: SkillContext): Promise<Verification> {
    return {
      fixId: fix.id,
      success: true,
      evidence: [],
      duration: 0,
    };
  }

  async cleanup?(): Promise<void>;

  /**
   * Check if this skill matches the given intent
   */
  matchesIntent(intent: string): boolean {
    return this.triggers.some(trigger => {
      if (trigger.type === 'keyword') {
        const pattern = trigger.pattern instanceof RegExp
          ? trigger.pattern
          : new RegExp(trigger.pattern, 'i');
        return pattern.test(intent);
      }
      return false;
    });
  }

  /**
   * Check if this skill can auto-fix the given diagnosis
   */
  canAutoFix(_diagnosis: Diagnosis): boolean {
    return this.capabilities.some(
      cap => cap.autoFixable && cap.riskLevel === 'low'
    );
  }
}
