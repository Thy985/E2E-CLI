/**
 * Report: the post-diagnose output rendered to HTML/JSON/Markdown/Compact.
 */

import type { ProjectInfo } from './project';
import type { Diagnosis, Severity } from './diagnosis';

export interface DiagnosisReport {
  version: string;
  timestamp: string;
  project: ProjectInfo;
  summary: ReportSummary;
  dimensions: Record<string, number>;
  issues: Diagnosis[];
  duration: number;
  exitCode: number;
}

export interface ReportSummary {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totalIssues: number;
  critical: number;
  warning: number;
  info: number;
  autoFixable: number;
}

export type { Severity };
