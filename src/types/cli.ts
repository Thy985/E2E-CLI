/**
 * CLI-specific types: context, options, output format.
 */

import type { Logger } from './logger';
import type { Severity } from './diagnosis';
import type { QAConfig } from '../config';

export interface CLIContext {
  cwd: string;
  config: Config;
  logger: Logger;
  output: OutputFormat;
}

/**
 * Alias of `QAConfig` from the config module. Re-exported here so consumers
 * don't need to know which module defines the source-of-truth interface.
 */
export type Config = QAConfig;

export type OutputFormat = 'html' | 'json' | 'markdown' | 'compact';

export interface DiagnoseOptions {
  skills?: string[];
  path?: string;
  url?: string;
  output?: OutputFormat;
  outputFile?: string;
  failOn?: Severity;
  quiet?: boolean;
  verbose?: boolean;
  ci?: boolean;
}

export interface FixOptions {
  issueIds?: string[];
  autoApprove?: ('low' | 'medium' | 'high')[];
  dryRun?: boolean;
  createPR?: boolean;
}
