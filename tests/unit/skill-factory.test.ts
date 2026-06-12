/**
 * Skill Factory Tests
 *
 * Tests for the unified skill instance factory.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getAllSkillInstances,
  getSkillInstance,
  getAllSkillNames,
  resetSkillInstances,
} from '../../src/engines/skill-factory';

describe('Skill Factory', () => {
  beforeEach(() => {
    resetSkillInstances();
  });

  describe('getAllSkillInstances()', () => {
    it('returns all 13 skill instances', () => {
      const instances = getAllSkillInstances();
      expect(Object.keys(instances).length).toBe(13);
    });

    it('returns expected skill names', () => {
      const instances = getAllSkillInstances();
      const names = Object.keys(instances).sort();
      expect(names).toEqual([
        'a11y',
        'api',
        'complexity',
        'dependency',
        'e2e',
        'nextjs',
        'nuxt',
        'performance',
        'react',
        'security',
        'seo',
        'uiux',
        'vue',
      ]);
    });

    it('each instance has a name property', () => {
      const instances = getAllSkillInstances();
      for (const [key, skill] of Object.entries(instances)) {
        // Some skills have names that differ from their registry key (e.g. uiux -> "ui-ux")
        expect(typeof skill.name).toBe('string');
        expect(skill.name.length).toBeGreaterThan(0);
      }
    });

    it('each instance has a version property', () => {
      const instances = getAllSkillInstances();
      for (const skill of Object.values(instances)) {
        expect(typeof skill.version).toBe('string');
      }
    });

    it('returns a new object reference each call (shallow copy)', () => {
      const a = getAllSkillInstances();
      const b = getAllSkillInstances();
      expect(a).not.toBe(b);
    });

    it('returns the same underlying instances (singleton)', () => {
      const a = getAllSkillInstances();
      const b = getAllSkillInstances();
      expect(a.a11y).toBe(b.a11y);
      expect(a.security).toBe(b.security);
      expect(a.react).toBe(b.react);
    });

    it('caches instances across calls', () => {
      const first = getAllSkillInstances();
      const second = getAllSkillInstances();
      // Same object references
      expect(first.a11y).toBe(second.a11y);
      expect(first.performance).toBe(second.performance);
      expect(first.vue).toBe(second.vue);
    });
  });

  describe('getSkillInstance()', () => {
    it('returns a specific skill by name', () => {
      const skill = getSkillInstance('a11y');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('a11y');
    });

    it('returns undefined for unknown skill', () => {
      const skill = getSkillInstance('nonexistent');
      expect(skill).toBeUndefined();
    });

    it('returns all framework skills', () => {
      expect(getSkillInstance('react')).toBeDefined();
      expect(getSkillInstance('vue')).toBeDefined();
      expect(getSkillInstance('nextjs')).toBeDefined();
      expect(getSkillInstance('nuxt')).toBeDefined();
    });

    it('returns all utility skills', () => {
      expect(getSkillInstance('e2e')).toBeDefined();
      expect(getSkillInstance('uiux')).toBeDefined();
      expect(getSkillInstance('seo')).toBeDefined();
      expect(getSkillInstance('api')).toBeDefined();
      expect(getSkillInstance('dependency')).toBeDefined();
      expect(getSkillInstance('complexity')).toBeDefined();
    });
  });

  describe('getAllSkillNames()', () => {
    it('returns array of skill names', () => {
      const names = getAllSkillNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBe(13);
    });

    it('includes all expected skill names', () => {
      const names = getAllSkillNames();
      expect(names).toContain('a11y');
      expect(names).toContain('security');
      expect(names).toContain('performance');
      expect(names).toContain('react');
      expect(names).toContain('vue');
      expect(names).toContain('nextjs');
      expect(names).toContain('nuxt');
    });
  });

  describe('resetSkillInstances()', () => {
    it('clears the cache', () => {
      const first = getAllSkillInstances();
      const a11yRef = first.a11y;

      resetSkillInstances();

      const second = getAllSkillInstances();
      // After reset, new instances are created
      expect(second.a11y).not.toBe(a11yRef);
    });

    it('allows fresh initialization', () => {
      getAllSkillInstances(); // Initialize
      resetSkillInstances(); // Reset

      const instances = getAllSkillInstances();
      expect(Object.keys(instances).length).toBe(13);
    });
  });
});
