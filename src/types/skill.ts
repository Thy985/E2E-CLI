/**
 * Skill + SkillContext contracts.
 *
 * SkillContext composes the other type modules — these cross-file
 * references are all `import type` to avoid runtime cycles.
 */

import type { Logger } from './logger';
import type { ProjectInfo } from './project';
import type { ToolRegistry } from './tool';
import type { ModelClient } from './model';
import type { Storage } from './storage';
import type { QAConfig } from '../config';

export interface Skill {
  name: string;
  version: string;
  description: string;
  triggers: SkillTrigger[];
  capabilities: SkillCapability[];
  init?(context: SkillContext): Promise<void>;
  diagnose(context: SkillContext): Promise<import('./diagnosis').Diagnosis[]>;
  fix?(diagnosis: import('./diagnosis').Diagnosis, context: SkillContext): Promise<import('./fix').Fix>;
  verify?(fix: import('./fix').Fix, context: SkillContext): Promise<import('./verification').Verification>;
  cleanup?(): Promise<void>;
  matchesIntent?(intent: string): boolean;
}

export interface SkillTrigger {
  type: 'command' | 'keyword' | 'file' | 'url';
  pattern: string | RegExp;
  priority?: number;
}

export interface SkillCapability {
  name: string;
  description: string;
  autoFixable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SkillContext {
  project: ProjectInfo;
  config: QAConfig;
  logger: Logger;
  tools: ToolRegistry;
  model: ModelClient;
  storage: Storage;
}

export interface SkillConfig {
  enabled: boolean;
  options: Record<string, any>;
}

export interface SkillConfigEntry {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}
