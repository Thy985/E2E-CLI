/**
 * Diagnosis: a single issue surfaced by a skill's diagnose() pass.
 */

export type DiagnosisType =
  | 'accessibility'
  | 'performance'
  | 'security'
  | 'functionality'
  | 'code-quality'
  | 'best-practice'
  | 'seo'
  | 'ui-ux'
  | 'e2e'
  | 'api'
  | 'dependency'
  | 'complexity';

export type Severity = 'critical' | 'warning' | 'info';

export interface Diagnosis {
  id: string;
  skill: string;
  type: DiagnosisType;
  severity: Severity;
  title: string;
  description: string;
  location: Location;
  evidence?: Evidence;
  fixSuggestion?: FixSuggestion;
  metadata?: Record<string, any>;
}

export interface Location {
  file: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Evidence {
  type: 'screenshot' | 'log' | 'code' | 'metric';
  content: string;
  format?: string;
}

export interface FixSuggestion {
  description: string;
  code?: string;
  autoApplicable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}
