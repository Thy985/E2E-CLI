/**
 * Built-in skills registry
 *
 * 所有内置 skill 的单点入口。新增/删除内置 skill 只需要改这一个文件，
 * CLI 命令（diagnose / audit / ux-audit 等）通过 `getAllBuiltinSkills()`
 * 一次性拿到全部。
 *
 * 注意：此处的 import 是静态的；只用于类型/类查找，运行时实例化由调用方完成。
 */

import { A11ySkill } from './a11y';
import { E2ESkill } from './e2e';
import { PerformanceSkill } from './performance';
import { SecuritySkill } from './security';
import { UIUXSkill } from './uiux';
import { SEOSkill } from './seo';
import { APISkill } from './api';
import { DependencySkill } from './dependency';
import { ComplexitySkill } from './complexity';
import { BestPracticesSkill } from './best-practices';
import type { BaseSkill } from '../base-skill';

/**
 * Skill 构造器签名
 */
export type SkillCtor = new () => BaseSkill;

/**
 * 内置 skill 列表 —— 顺序决定默认运行顺序
 */
export const BUILTIN_SKILLS: readonly SkillCtor[] = [
  E2ESkill,
  A11ySkill,
  PerformanceSkill,
  SecuritySkill,
  UIUXSkill,
  SEOSkill,
  APISkill,
  DependencySkill,
  ComplexitySkill,
  BestPracticesSkill,
] as readonly SkillCtor[];

/**
 * 单次扫描 — 调用方拿到的是新实例，避免 registry 之间共享状态。
 */
export function getAllBuiltinSkills(): BaseSkill[] {
  return BUILTIN_SKILLS.map((Ctor) => new Ctor());
}
