/**
 * QA-Agent public type surface.
 *
 * v0.4 split this single 493-line file into 14 theme modules.
 * Every export below is a re-export of the canonical declaration in the
 * matching sub-module — DO NOT redeclare any type here.
 *
 * Adding a new type? Put it in the right sub-module and re-export from here.
 */

export type {
  Skill,
  SkillTrigger,
  SkillCapability,
  SkillContext,
  SkillConfig,
  SkillConfigEntry,
} from './skill';

export type {
  DiagnosisType,
  Severity,
  Diagnosis,
  Location,
  Evidence,
  FixSuggestion,
} from './diagnosis';

export type { Fix, FileChange } from './fix';

export type { Verification, VerificationEvidence } from './verification';

export type { DiagnosisReport, ReportSummary } from './report';

export type { ProjectInfo } from './project';

export type {
  ToolRegistry,
  FileSystemTool,
  BrowserTool,
  BrowserOptions,
  Browser,
  Page,
  ScreenshotOptions,
  GitTool,
  ShellTool,
  ShellOptions,
  ShellResult,
} from './tool';

export type {
  ModelClient,
  ModelMessage,
  ModelOptions,
  ModelRequest,
  ModelResponse,
} from './model';

export type { Storage } from './storage';

export type { Logger } from './logger';

export type {
  CLIContext,
  Config,
  OutputFormat,
  DiagnoseOptions,
  FixOptions,
} from './cli';

export type {
  PermissionLevel,
  PermissionConfig,
  Operation,
  PermissionResult,
} from './permission';

export type {
  AuditReport,
  AuditSummary,
  AuditCategory,
  AuditCheck,
  ComplianceResult,
  ComplianceRequirement,
  TrendAnalysis,
  TrendPoint,
  AuditRecommendation,
  AuditOptions,
} from './audit';
