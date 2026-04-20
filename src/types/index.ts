/**
 * Core type definitions for QA-Agent
 */

// ============================================
// Skill Types
// ============================================

export interface Skill {
  name: string;
  version: string;
  description: string;
  triggers: SkillTrigger[];
  capabilities: SkillCapability[];
  init?(context: SkillContext): Promise<void>;
  diagnose(context: SkillContext): Promise<Diagnosis[]>;
  fix?(diagnosis: Diagnosis, context: SkillContext): Promise<Fix>;
  verify?(fix: Fix, context: SkillContext): Promise<Verification>;
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
  config: SkillConfig;
  logger: Logger;
  tools: ToolRegistry;
  model: ModelClient;
  storage: Storage;
}

export interface SkillConfig {
  enabled: boolean;
  options: Record<string, any>;
}

// ============================================
// Diagnosis Types
// ============================================

export type DiagnosisType = 
  | 'accessibility'
  | 'performance'
  | 'security'
  | 'functionality'
  | 'code-quality'
  | 'ui-ux';

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

// ============================================
// Fix Types
// ============================================

export interface Fix {
  id: string;
  diagnosisId: string;
  description: string;
  changes: FileChange[];
  riskLevel: 'low' | 'medium' | 'high';
  autoApplicable: boolean;
  verificationSteps?: string[];
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

// ============================================
// Verification Types
// ============================================

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

// ============================================
// Report Types
// ============================================

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

// ============================================
// Project Types
// ============================================

export interface ProjectInfo {
  name: string;
  path: string;
  type?: 'webapp' | 'library' | 'cli' | 'api';
  framework?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
}

// ============================================
// Tool Types
// ============================================

export interface ToolRegistry {
  fs: FileSystemTool;
  browser: BrowserTool;
  git: GitTool;
  shell: ShellTool;
}

export interface FileSystemTool {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  glob(pattern: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  stat(path: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
}

export interface BrowserTool {
  launch(options?: BrowserOptions): Promise<Browser>;
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

export interface BrowserOptions {
  headless?: boolean;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
}

export interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

export interface Page {
  goto(url: string): Promise<void>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  content(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;
  close(): Promise<void>;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  path?: string;
}

export interface GitTool {
  getChangedFiles(baseRef?: string): Promise<string[]>;
  getCurrentBranch(): Promise<string>;
  getCommitHash(): Promise<string>;
}

export interface ShellTool {
  execute(command: string, options?: ShellOptions): Promise<ShellResult>;
}

export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ============================================
// Model Types
// ============================================

export interface ModelClient {
  chat(messages: ModelMessage[]): Promise<string>;
  embed?(text: string): Promise<number[]>;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================
// Storage Types
// ============================================

export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ============================================
// Logger Types
// ============================================

export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}

// ============================================
// CLI Types
// ============================================

export interface CLIContext {
  cwd: string;
  config: Config;
  logger: Logger;
  output: OutputFormat;
}

export interface Config {
  version: number;
  project?: {
    name: string;
    type?: string;
  };
  skills?: SkillConfigEntry[];
  model?: {
    provider: string;
    model: string;
  };
  output?: {
    format: string;
    path: string;
  };
  ignore?: string[];
}

export interface SkillConfigEntry {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

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

// ============================================
// Permission Types
// ============================================

export type PermissionLevel = 'read-only' | 'suggest' | 'write' | 'execute';

export interface PermissionConfig {
  default: PermissionLevel;
  writeAllowList: string[];
  denyList: string[];
  commandAllowList: string[];
  commandDenyList: string[];
}

export interface Operation {
  type: 'read' | 'write' | 'execute';
  target: string;
  requiredLevel: number;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ============================================
// Audit Types
// ============================================

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
  description: string;
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
