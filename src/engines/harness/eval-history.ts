/**
 * 评估历史存储模块
 *
 * 持久化每次 Golden Set 评估结果，用于趋势分析、回归检测和历史对比。
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EvalHistoryEntry {
  /** 评估时间戳 (ISO 8601) */
  timestamp: string;
  /** Git commit hash (如果可用) */
  commit?: string;
  /** Git branch (如果可用) */
  branch?: string;
  /** 评估总体指标 */
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgPrecision: number;
  avgRecall: number;
  avgF1: number;
  passRate: number;
  /** 按 skill 分组指标 */
  bySkill: Record<string, { cases: number; passed: number; f1: number }>;
  /** 按难度分组指标 */
  byDifficulty: Record<string, { cases: number; passed: number; f1: number }>;
  /** 质量门禁结果 */
  qualityGatePassed: boolean;
}

const DEFAULT_HISTORY_DIR = '.qa-history';
const DEFAULT_HISTORY_FILE = 'eval-history.json';
const MAX_HISTORY_ENTRIES = 100;

/** 获取历史存储路径 */
export function getHistoryDir(basePath?: string): string {
  const base = basePath || process.cwd();
  return path.join(base, DEFAULT_HISTORY_DIR);
}

export function getHistoryFile(basePath?: string): string {
  return path.join(getHistoryDir(basePath), DEFAULT_HISTORY_FILE);
}

/** 加载评估历史 */
export function loadEvalHistory(basePath?: string): EvalHistoryEntry[] {
  const filePath = getHistoryFile(basePath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** 保存评估历史 */
export function saveEvalHistory(
  entry: EvalHistoryEntry,
  basePath?: string,
): void {
  const history = loadEvalHistory(basePath);

  // 添加新条目到开头
  history.unshift(entry);

  // 限制历史条目数量
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }

  // 确保目录存在
  const historyDir = getHistoryDir(basePath);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const filePath = getHistoryFile(basePath);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

/** 获取最近 N 条历史记录 */
export function getRecentHistory(
  count: number = 10,
  basePath?: string,
): EvalHistoryEntry[] {
  const history = loadEvalHistory(basePath);
  return history.slice(0, count);
}

/** 计算趋势分析 */
export function analyzeTrend(
  history: EvalHistoryEntry[],
  metric: 'avgF1' | 'passRate' | 'avgPrecision' | 'avgRecall',
): {
  values: number[];
  timestamps: string[];
  trend: 'improving' | 'declining' | 'stable';
  change: number;
} {
  if (history.length < 2) {
    return {
      values: history.map((h) => h[metric]),
      timestamps: history.map((h) => h.timestamp),
      trend: 'stable',
      change: 0,
    };
  }

  const values = history.map((h) => h[metric]);
  const timestamps = history.map((h) => h.timestamp);

  // Compare recent entries vs older entries without overlap
  const halfCount = Math.floor(history.length / 2);
  const recentCount = Math.min(3, halfCount);
  const olderCount = Math.min(3, history.length - recentCount);

  const recentAvg =
    values.slice(0, recentCount).reduce((s, v) => s + v, 0) / recentCount;
  const olderAvg =
    values
      .slice(-olderCount)
      .reduce((s, v) => s + v, 0) / olderCount;

  const change = recentAvg - olderAvg;
  let trend: 'improving' | 'declining' | 'stable';

  if (change > 0.02) {
    trend = 'improving';
  } else if (change < -0.02) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  return { values, timestamps, trend, change };
}

/** 获取特定 skill 的历史趋势 */
export function getSkillTrend(
  history: EvalHistoryEntry[],
  skill: string,
): {
  values: number[];
  timestamps: string[];
  trend: 'improving' | 'declining' | 'stable';
} {
  const values: number[] = [];
  const timestamps: string[] = [];

  for (const entry of history) {
    if (entry.bySkill[skill]) {
      values.push(entry.bySkill[skill].f1);
      timestamps.push(entry.timestamp);
    }
  }

  if (values.length < 2) {
    return { values, timestamps, trend: 'stable' };
  }

  const recentAvg = values.slice(0, 2).reduce((s, v) => s + v, 0) / 2;
  const olderAvg = values.slice(-2).reduce((s, v) => s + v, 0) / 2;
  const change = recentAvg - olderAvg;

  let trend: 'improving' | 'declining' | 'stable';
  if (change > 0.02) trend = 'improving';
  else if (change < -0.02) trend = 'declining';
  else trend = 'stable';

  return { values, timestamps, trend };
}

/** 获取所有 skill 列表 */
export function getAllSkills(history: EvalHistoryEntry[]): string[] {
  const skills = new Set<string>();
  for (const entry of history) {
    for (const skill of Object.keys(entry.bySkill)) {
      skills.add(skill);
    }
  }
  return [...skills].sort();
}
