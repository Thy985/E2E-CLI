/**
 * Skills Module Entry Point
 */

export { BaseSkill } from './base-skill';
export { SkillRegistry, createSkillRegistry } from './registry';
export { A11ySkill } from './builtin/a11y';
export { E2ESkill } from './builtin/e2e';
export { UIUXSkill } from './builtin/uiux';
export { BestPracticesSkill } from './builtin/best-practices';
export { SEOSkill } from './builtin/seo';
export { DependencySkill } from './builtin/dependency';
export { SecuritySkill } from './builtin/security';
export { PerformanceSkill } from './builtin/performance';
export { ComplexitySkill } from './builtin/complexity';
export { APISkill } from './builtin/api';

import { A11ySkill } from './builtin/a11y';
import { E2ESkill } from './builtin/e2e';
import { UIUXSkill } from './builtin/uiux';
import { BestPracticesSkill } from './builtin/best-practices';
import { SEOSkill } from './builtin/seo';
import { DependencySkill } from './builtin/dependency';
import { SecuritySkill } from './builtin/security';
import { PerformanceSkill } from './builtin/performance';
import { ComplexitySkill } from './builtin/complexity';
import { APISkill } from './builtin/api';
import type { Skill } from '../types';

/**
 * Return all built-in skill instances.
 * Use this in registries/engines that need to enumerate skills without
 * a manual import list.
 */
export function getRegisteredSkills(): Skill[] {
  return [
    new A11ySkill(),
    new E2ESkill(),
    new UIUXSkill(),
    new BestPracticesSkill(),
    new SEOSkill(),
    new DependencySkill(),
    new SecuritySkill(),
    new PerformanceSkill(),
    new ComplexitySkill(),
    new APISkill(),
  ];
}
