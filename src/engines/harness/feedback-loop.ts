/**
 * User Feedback Loop Engine
 *
 * Collects, stores, and analyzes user feedback on diagnoses and fixes
 * (accept/reject signals). Provides insights and recommendations for
 * improving skill/rule quality based on user feedback patterns.
 */

import { generateId } from '../../utils';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export type FeedbackAction = 'accept' | 'reject' | 'partial' | 'ignore';

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  // What was the feedback about
  skill: string;
  ruleId: string;
  diagnosisId?: string;
  fixId?: string;
  // User action
  action: FeedbackAction;
  // Optional user notes
  notes?: string;
  // Context (for analysis)
  severity?: string;
  filePath?: string;
}

export interface FeedbackStats {
  totalFeedbacks: number;
  byAction: Record<FeedbackAction, number>;
  bySkill: Record<string, { accept: number; reject: number; total: number }>;
  acceptRate: number;
  rejectRate: number;
}

export interface FeedbackInsight {
  skill: string;
  ruleId: string;
  acceptRate: number;
  totalFeedbacks: number;
  recommendation: string;
  confidence: 'low' | 'medium' | 'high';
}

// ── Storage ────────────────────────────────────────────────────────────────

const FEEDBACK_DIR = '.qa-feedback';
const FEEDBACK_FILE = 'feedback.json';

function resolveFeedbackPath(basePath?: string): { dir: string; file: string } {
  const root = basePath || process.cwd();
  const dir = path.join(root, FEEDBACK_DIR);
  const file = path.join(dir, FEEDBACK_FILE);
  return { dir, file };
}

/** Load all feedback entries */
export function loadFeedback(basePath?: string): FeedbackEntry[] {
  const { file: filePath } = resolveFeedbackPath(basePath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Save a single feedback entry */
export function saveFeedback(entry: FeedbackEntry, basePath?: string): void {
  const { dir, file } = resolveFeedbackPath(basePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const entries = loadFeedback(basePath);
  entries.unshift(entry);
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
}

/** Get recent feedback entries */
export function getRecentFeedback(count: number = 10, basePath?: string): FeedbackEntry[] {
  const entries = loadFeedback(basePath);
  return entries.slice(0, count);
}

/** Clear all feedback */
export function clearFeedback(basePath?: string): void {
  const { file: filePath } = resolveFeedbackPath(basePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ── Engine ─────────────────────────────────────────────────────────────────

export class FeedbackLoopEngine {
  private storageDir: string | undefined;

  constructor(opts?: { storageDir?: string }) {
    this.storageDir = opts?.storageDir;
  }

  /** Collect feedback for a diagnosis/fix */
  collectFeedback(
    skill: string,
    ruleId: string,
    action: FeedbackAction,
    context?: {
      diagnosisId?: string;
      fixId?: string;
      notes?: string;
      severity?: string;
      filePath?: string;
    },
  ): FeedbackEntry {
    const entry: FeedbackEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      skill,
      ruleId,
      action,
      diagnosisId: context?.diagnosisId,
      fixId: context?.fixId,
      notes: context?.notes,
      severity: context?.severity,
      filePath: context?.filePath,
    };
    saveFeedback(entry, this.storageDir);
    return entry;
  }

  /** Analyze all collected feedback */
  analyzeFeedback(): FeedbackStats {
    const entries = loadFeedback(this.storageDir);

    const byAction: Record<FeedbackAction, number> = {
      accept: 0,
      reject: 0,
      partial: 0,
      ignore: 0,
    };
    const bySkill: Record<string, { accept: number; reject: number; total: number }> = {};

    for (const entry of entries) {
      byAction[entry.action]++;

      if (!bySkill[entry.skill]) {
        bySkill[entry.skill] = { accept: 0, reject: 0, total: 0 };
      }
      bySkill[entry.skill].total++;
      if (entry.action === 'accept') bySkill[entry.skill].accept++;
      if (entry.action === 'reject') bySkill[entry.skill].reject++;
    }

    const total = entries.length;
    return {
      totalFeedbacks: total,
      byAction,
      bySkill,
      acceptRate: total > 0 ? byAction.accept / total : 0,
      rejectRate: total > 0 ? byAction.reject / total : 0,
    };
  }

  /** Get insights per skill/rule */
  getInsights(): FeedbackInsight[] {
    const entries = loadFeedback(this.storageDir);
    const groups = this._groupByRule(entries);

    const insights: FeedbackInsight[] = [];

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const [skill, ruleId] = key.split('::');
      const total = group.length;
      const acceptCount = group.filter((e) => e.action === 'accept').length;
      const acceptRate = total > 0 ? acceptCount / total : 0;

      let confidence: 'low' | 'medium' | 'high';
      if (total >= 10) confidence = 'high';
      else if (total >= 3) confidence = 'medium';
      else confidence = 'low';

      insights.push({
        skill,
        ruleId,
        acceptRate,
        totalFeedbacks: total,
        recommendation: this._generateInsightRecommendation(acceptRate, total),
        confidence,
      });
    }

    return insights.sort((a, b) => a.acceptRate - b.acceptRate);
  }

  /** Group feedback entries by skill+ruleId */
  private _groupByRule(entries: FeedbackEntry[]): Record<string, FeedbackEntry[]> {
    const groups: Record<string, FeedbackEntry[]> = {};
    for (const entry of entries) {
      const key = `${entry.skill}::${entry.ruleId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  }

  private _generateInsightRecommendation(acceptRate: number, total: number): string {
    if (total === 0) return 'No feedback yet';
    if (acceptRate > 0.9) return 'Highly valued rule — consider promoting';
    if (acceptRate >= 0.7) return 'Generally useful rule';
    if (acceptRate >= 0.4) return 'Mixed reception — consider tuning';
    if (total >= 5 && acceptRate < 0.2) return 'Strong negative signal — consider disabling';
    return 'Needs more feedback for clear recommendation';
  }

  /** Get skill-level feedback summary */
  getSkillStats(skill: string): {
    acceptRate: number;
    totalFeedbacks: number;
    topRejectedRules: Array<{ ruleId: string; rejectCount: number }>;
  } {
    const entries = loadFeedback(this.storageDir).filter((e) => e.skill === skill);

    const ruleRejects: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.action === 'reject') {
        ruleRejects[entry.ruleId] = (ruleRejects[entry.ruleId] || 0) + 1;
      }
    }

    const topRejectedRules = Object.entries(ruleRejects)
      .map(([ruleId, rejectCount]) => ({ ruleId, rejectCount }))
      .sort((a, b) => b.rejectCount - a.rejectCount)
      .slice(0, 5);

    const acceptCount = entries.filter((e) => e.action === 'accept').length;

    return {
      acceptRate: entries.length > 0 ? acceptCount / entries.length : 0,
      totalFeedbacks: entries.length,
      topRejectedRules,
    };
  }

  /** Generate recommendations based on feedback patterns */
  generateRecommendations(): Array<{
    type: 'disable' | 'tune' | 'promote' | 'investigate';
    skill: string;
    ruleId?: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    const entries = loadFeedback(this.storageDir);
    const groups = this._groupByRule(entries);

    const recommendations: Array<{
      type: 'disable' | 'tune' | 'promote' | 'investigate';
      skill: string;
      ruleId?: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
    }> = [];

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const [skill, ruleId] = key.split('::');
      const total = group.length;
      const acceptCount = group.filter((e) => e.action === 'accept').length;
      const rejectCount = group.filter((e) => e.action === 'reject').length;
      const partialCount = group.filter((e) => e.action === 'partial').length;
      const acceptRate = total > 0 ? acceptCount / total : 0;
      const rejectRate = total > 0 ? rejectCount / total : 0;

      if (rejectRate > 0.8 && total > 5) {
        recommendations.push({
          type: 'disable',
          skill,
          ruleId,
          reason: `${ruleId} has ${((rejectRate) * 100).toFixed(0)}% reject rate across ${total} feedbacks`,
          priority: 'high',
        });
        continue;
      }

      if (acceptRate > 0.9 && total >= 3) {
        recommendations.push({
          type: 'promote',
          skill,
          ruleId,
          reason: `${ruleId} has ${((acceptRate) * 100).toFixed(0)}% accept rate across ${total} feedbacks`,
          priority: 'medium',
        });
        continue;
      }

      if (acceptRate >= 0.4 && acceptRate <= 0.6 && total >= 3) {
        recommendations.push({
          type: 'tune',
          skill,
          ruleId,
          reason: `${ruleId} has ${((acceptRate) * 100).toFixed(0)}% accept rate — needs refinement`,
          priority: 'medium',
        });
        continue;
      }

      if (total >= 5) {
        const hasAccept = acceptCount > 0;
        const hasReject = rejectCount > 0;
        const hasPartial = partialCount > 0;
        const mixedSignals = (hasAccept ? 1 : 0) + (hasReject ? 1 : 0) + (hasPartial ? 1 : 0);

        if (mixedSignals >= 2 && acceptRate >= 0.3 && acceptRate <= 0.7) {
          recommendations.push({
            type: 'investigate',
            skill,
            ruleId,
            reason: `${ruleId} has mixed feedback: ${acceptCount} accept, ${rejectCount} reject, ${partialCount} partial`,
            priority: 'low',
          });
        }
      }
    }

    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );
  }
}
