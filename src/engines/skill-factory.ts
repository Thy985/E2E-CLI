/**
 * Skill Factory — 统一 Skill 注册
 *
 * 所有入口（eval/diagnose/CI）必须通过此工厂获取 Skill 实例，
 * 避免在多处重复实例化导致的不一致。
 */

import type { BaseSkill } from '../skills/base-skill';
import { A11ySkill } from '../skills/builtin/a11y';
import { SecuritySkill } from '../skills/builtin/security';
import { PerformanceSkill } from '../skills/builtin/performance';
import { ReactSkill } from '../skills/builtin/react';
import { VueSkill } from '../skills/builtin/vue';
import { NextJSSkill } from '../skills/builtin/framework/nextjs';
import { NuxtSkill } from '../skills/builtin/framework/nuxt';
import { E2ESkill } from '../skills/builtin/e2e';
import { UIUXSkill } from '../skills/builtin/uiux';
import { SEOSkill } from '../skills/builtin/seo';
import { APISkill } from '../skills/builtin/api';
import { DependencySkill } from '../skills/builtin/dependency';
import { ComplexitySkill } from '../skills/builtin/complexity';

/** 所有内置 Skill 的实例缓存 */
let _instances: Record<string, BaseSkill> | null = null;

/**
 * 获取所有内置 Skill 实例（单例模式）
 * 返回一个新的对象引用，但实例是共享的。
 */
export function getAllSkillInstances(): Record<string, BaseSkill> {
  if (!_instances) {
    _instances = {
      a11y: new A11ySkill(),
      security: new SecuritySkill(),
      performance: new PerformanceSkill(),
      react: new ReactSkill(),
      vue: new VueSkill(),
      nextjs: new NextJSSkill(),
      nuxt: new NuxtSkill(),
      e2e: new E2ESkill(),
      uiux: new UIUXSkill(),
      seo: new SEOSkill(),
      api: new APISkill(),
      dependency: new DependencySkill(),
      complexity: new ComplexitySkill(),
    };
  }
  return { ..._instances };
}

/**
 * 获取指定 Skill 的实例
 */
export function getSkillInstance(name: string): BaseSkill | undefined {
  const all = getAllSkillInstances();
  return all[name];
}

/**
 * 获取所有 Skill 名称列表
 */
export function getAllSkillNames(): string[] {
  return Object.keys(getAllSkillInstances());
}

/**
 * 重置缓存（仅用于测试）
 */
export function resetSkillInstances(): void {
  _instances = null;
}
