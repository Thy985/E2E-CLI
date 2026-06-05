/**
 * ignore comments tests
 *
 * 覆盖：
 * - shouldIgnoreLine / shouldIgnoreSection / isLineIgnored 行为
 * - ignore / ignore-next-line / ignore-start..end 三种语法
 * - ruleId 过滤（all / specific / none）
 */

import { describe, it, expect } from 'bun:test';
import {
  shouldIgnoreLine,
  shouldIgnoreSection,
  isLineIgnored,
  parseIgnoreComments,
} from '../../src/utils/ignore';

describe('ignore comments', () => {
  describe('parseIgnoreComments / shouldIgnoreLine', () => {
    it('returns map of ignored lines', () => {
      const content = `line 1
// qa-agent-ignore
line 3
line 4`;
      const map = parseIgnoreComments(content);
      expect(map.get(2)).toEqual(['all']);
    });

    it('extracts specific rule ids', () => {
      const content = `line 1
// qa-agent-ignore rule-a,rule-b
line 3`;
      expect(shouldIgnoreLine(content, 2, 'rule-a')).toBe(true);
      expect(shouldIgnoreLine(content, 2, 'rule-b')).toBe(true);
      expect(shouldIgnoreLine(content, 2, 'rule-c')).toBe(false);
    });

    it('matches any rule when no ruleId is given', () => {
      const content = `// qa-agent-ignore rule-a`;
      expect(shouldIgnoreLine(content, 1)).toBe(true);
    });
  });

  describe('shouldIgnoreLine with next-line directive', () => {
    it('ignores the line right after the directive', () => {
      const content = `// qa-agent-ignore-next-line rule-x
const x = 1;`;
      expect(shouldIgnoreLine(content, 2, 'rule-x')).toBe(true);
      expect(shouldIgnoreLine(content, 2, 'rule-other')).toBe(false);
    });
  });

  describe('shouldIgnoreSection (start..end)', () => {
    it('reports a section that overlaps the query range', () => {
      const content = `line 1
// qa-agent-ignore-start
line 3
line 4
// qa-agent-ignore-end
line 6`;
      expect(shouldIgnoreSection(content, 2, 4, 'rule-x')).toBe(true);
    });

    it('does not report a section that ends before the query', () => {
      const content = `// qa-agent-ignore-start
// qa-agent-ignore-end
line 3
line 4`;
      expect(shouldIgnoreSection(content, 5, 6, 'rule-x')).toBe(false);
    });
  });

  describe('isLineIgnored (line + section composite)', () => {
    it('catches line-level ignore', () => {
      const content = `line 1
// qa-agent-ignore
line 3`;
      expect(isLineIgnored(content, 2)).toBe(true);
      expect(isLineIgnored(content, 3)).toBe(false);
    });

    it('catches section-level ignore', () => {
      const content = `line 0
// qa-agent-ignore-start
line 2
// qa-agent-ignore-end`;
      expect(isLineIgnored(content, 2)).toBe(true);
      expect(isLineIgnored(content, 1)).toBe(false);
    });

    it('treats unclosed start as ending at EOF', () => {
      const content = `// qa-agent-ignore-start
line 2
line 3`;
      expect(isLineIgnored(content, 2)).toBe(true);
      expect(isLineIgnored(content, 3)).toBe(true);
    });
  });
});
