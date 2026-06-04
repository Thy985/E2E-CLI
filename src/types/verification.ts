/**
 * Verification: result of running a skill's verify() pass against an applied fix.
 */

export interface Verification {
  fixId: string;
  success: boolean;
  evidence: VerificationEvidence[];
  duration: number;
}

export interface VerificationEvidence {
  type: 'test' | 'visual' | 'metric';
  description: string;
  passed: boolean;
  details?: string;
}
