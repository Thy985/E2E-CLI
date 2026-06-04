/**
 * Core module: business logic shared by CLI and web API.
 *
 * Before this module existed, `cli/commands/diagnose.ts`, `web/api/diagnose.ts`,
 * `cli/commands/fix.ts`, and `web/api/fix.ts` each had their own
 * `getProjectInfo`, context construction, and applyFix implementations.
 *
 * Anything that is "the same in both CLI and HTTP" lives here. Anything that
 * is "only meaningful in one entry point" (CI annotations, spinners, file
 * output paths) stays in the caller.
 */

export { getProjectInfo } from './project-info';
export type { GetProjectInfoOptions } from './project-info';

export {
  buildSkillContext,
  cleanupSkillContext,
} from './context';
export type { BuildSkillContextOptions, BuiltContext } from './context';

export { runDiagnose, cleanupDiagnose } from './diagnose';
export type {
  RunDiagnoseOptions,
  RunDiagnoseResult,
} from './diagnose';

export {
  previewFixes,
  applyFixes,
  cleanupFixes,
} from './fix';
export type {
  PreviewFixesOptions,
  PreviewFixesItem,
  PreviewFixesResult,
  ApplyFixesOptions,
  ApplyFixesResult,
  ApplyFixesInput,
} from './fix';
