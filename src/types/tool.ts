/**
 * Tool abstractions exposed via SkillContext.tools.
 *
 * Implementations live in `src/tools/`.
 */

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
