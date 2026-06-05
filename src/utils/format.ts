/**
 * Formatting helpers for durations and sizes
 */

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)}${units[i]}`;
}

/**
 * HTML escape — protect against XSS when interpolating user-controlled
 * strings into HTML / attribute values. The order matters: `&` must be
 * replaced first, otherwise the `&` introduced by other replacements
 * (e.g. `&lt;`) would be double-escaped to `&amp;lt;`.
 */
export function escapeHTML(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

// ============================================
// Score / Grade 视觉常量
// 原本散落在 audit.ts 和 formatter.ts 两处，颜色/阈值/emoji 各自定义不统一。
// 集中后所有评分视觉都走这里，避免在 audit 报告里 A 是 🏆、B 是 ✅，HTML 报告里又用别的颜色。
// ============================================

/** 80 / 60 是软阈值，与 best-practices 的评分卡保持一致。 */
export const SCORE_HEALTHY = 80;
export const SCORE_WARNING = 60;

const GRADE_EMOJI: Record<string, string> = {
  A: '🏆',
  B: '✅',
  C: '⚠️',
  D: '🔶',
  F: '❌',
};

const STATUS_EMOJI: Record<string, string> = {
  healthy: '💚',
  warning: '💛',
  critical: '❤️',
};

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🔵',
};

export function gradeEmoji(grade: string): string {
  return GRADE_EMOJI[grade] ?? '';
}

export function healthEmoji(status: string): string {
  return STATUS_EMOJI[status] ?? '';
}

export function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] ?? '#64748b';
}

/** 用于 HTML 报告里 category 块按 score 着色（无 grade 信息时退化）。 */
export function scoreColor(score: number): string {
  if (score >= SCORE_HEALTHY) return GRADE_COLORS.A;
  if (score >= SCORE_WARNING) return GRADE_COLORS.C;
  return GRADE_COLORS.F;
}

export function priorityEmoji(priority: string): string {
  return PRIORITY_EMOJI[priority] ?? '⚪';
}

/** Audit / Report 顶层最大展示条数。3 个地方共用：audit display / formatHTML / formatMarkdown。 */
export const MAX_RECOMMENDATIONS_DISPLAY = 5;

