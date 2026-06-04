/**
 * Fix: a list of file changes produced by a skill's fix() pass.
 */

export interface Fix {
  id: string;
  diagnosisId: string;
  description: string;
  changes: FileChange[];
  riskLevel: 'low' | 'medium' | 'high';
  autoApplicable: boolean;
  verificationSteps?: string[];
  notes?: string;
}

export interface FileChange {
  file: string;
  type: 'insert' | 'delete' | 'replace';
  position?: {
    line: number;
    column?: number;
  };
  content?: string;
  oldContent?: string;
}
