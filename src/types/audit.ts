/**
 * Audit report types — used by the `qa-agent audit` command.
 */

import type { ProjectInfo } from './project';

export interface AuditReport {
  version: string;
  timestamp: string;
  project: ProjectInfo;
  summary: AuditSummary;
  categories: AuditCategory[];
  compliance?: ComplianceResult;
  trends?: TrendAnalysis;
  recommendations: AuditRecommendation[];
  duration: number;
}

export interface AuditSummary {
  overallScore: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  healthStatus: 'healthy' | 'warning' | 'critical';
  categoryScores: Record<string, number>;
  totalIssues: number;
  criticalIssues: number;
}

export interface AuditCategory {
  name: string;
  displayName: string;
  score: number;
  weight: number;
  status: 'pass' | 'warning' | 'fail';
  checks: AuditCheck[];
  description?: string;
}

export interface AuditCheck {
  id: string;
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  score: number;
  maxScore: number;
  details?: string;
  fixSuggestion?: string;
  severity?: 'critical' | 'warning' | 'info';
}

export interface ComplianceResult {
  standard: string;
  version: string;
  score: number;
  status: 'compliant' | 'partial' | 'non-compliant';
  requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'na';
  description?: string;
  evidence?: string;
}

export interface TrendAnalysis {
  period: string;
  previousScore: number;
  currentScore: number;
  change: number;
  trend: 'improving' | 'stable' | 'declining';
  history: TrendPoint[];
}

export interface TrendPoint {
  date: string;
  score: number;
  issues: number;
}

export interface AuditRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  autoFixable: boolean;
}

export interface AuditOptions {
  path?: string;
  comprehensive?: boolean;
  compliance?: string[];
  output?: 'html' | 'json' | 'markdown' | 'compact';
  outputFile?: string;
  compareWith?: string;
  quiet?: boolean;
  verbose?: boolean;
}
