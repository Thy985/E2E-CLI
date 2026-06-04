/**
 * Project metadata surfaced to skills via SkillContext.
 */
export interface ProjectInfo {
  name: string;
  path: string;
  type?: 'webapp' | 'library' | 'cli' | 'api';
  framework?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
}
