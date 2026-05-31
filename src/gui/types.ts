/**
 * GUI Agent Types
 */

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export interface GUIAgentOptions {
  browser?: BrowserType;
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  slowMo?: number;
}

export interface PageOptions {
  url: string;
  waitFor?: string | RegExp;
  timeout?: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  path?: string;
}

export interface CompareOptions {
  baseline: string | Buffer;
  current: string | Buffer;
  threshold?: number;
  output?: string;
}

export interface CompareResult {
  match: boolean;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  diffImage?: Buffer;
}

export interface TestOptions {
  url: string;
  scenario: string;
  verify?: string;
  timeout?: number;
}

export interface TestResult {
  success: boolean;
  steps: TestStep[];
  duration: number;
  screenshots: string[];
  error?: string;
}

export interface TestStep {
  action: string;
  selector?: string;
  value?: string;
  success: boolean;
  duration: number;
  screenshot?: string;
  error?: string;
}

export interface ExecuteOptions {
  url: string;
  task: string;
  timeout?: number;
}

export interface ExecuteResult {
  success: boolean;
  steps: ExecutedStep[];
  duration: number;
  screenshots: string[];
}

export interface ExecutedStep {
  description: string;
  action: string;
  selector?: string;
  value?: string;
  success: boolean;
}

export interface VisualTestOptions {
  url: string;
  name: string;
  baselineDir?: string;
  currentDir?: string;
  threshold?: number;
  selectors?: string[];
}

export interface VisualTestResult {
  passed: boolean;
  results: VisualDiffResult[];
  duration: number;
}

export interface VisualDiffResult {
  name: string;
  selector?: string;
  match: boolean;
  diffPercentage: number;
  baselinePath: string;
  currentPath: string;
  diffPath?: string;
}

export interface Recording {
  id: string;
  url: string;
  steps: RecordedStep[];
  createdAt: Date;
}

export interface RecordedStep {
  type: 'click' | 'input' | 'navigate' | 'scroll' | 'select' | 'wait';
  selector?: string;
  value?: string;
  timestamp: number;
  screenshot?: string;
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isEnabled: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
