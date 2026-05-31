/**
 * GUI Agent
 * Main entry point for browser automation and visual testing
 */

import * as path from 'path';
import * as fs from 'fs';
import { BrowserController } from './browser';
import { VisualComparator } from './visual/compare';
import { SmartActor } from './actor';
import { createModelClient } from '../models';
import {
  GUIAgentOptions,
  TestOptions,
  TestResult,
  TestStep,
  VisualTestOptions,
  VisualTestResult,
  VisualDiffResult,
  ExecuteOptions,
  ExecuteResult,
  ScreenshotOptions,
  CompareResult,
} from './types';

export class GUIAgent {
  private browser: BrowserController;
  private comparator: VisualComparator;
  private actor: SmartActor | null = null;
  private options: GUIAgentOptions;
  private model: ReturnType<typeof createModelClient>;

  constructor(options: GUIAgentOptions = {}) {
    this.options = options;
    this.browser = new BrowserController(options);
    this.comparator = new VisualComparator();
    this.model = createModelClient();
  }

  /**
   * Launch browser
   */
  async launch(): Promise<void> {
    await this.browser.launch();
    this.actor = new SmartActor(this.browser, this.model);
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    await this.browser.close();
    this.actor = null;
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string): Promise<void> {
    await this.browser.newPage(url);
  }

  /**
   * Take screenshot
   */
  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    return await this.browser.screenshot(options);
  }

  /**
   * Run E2E test
   */
  async runTest(options: TestOptions): Promise<TestResult> {
    const startTime = Date.now();
    const steps: TestStep[] = [];
    const screenshots: string[] = [];

    try {
      // Navigate to URL
      await this.browser.newPage(options.url);

      // Take initial screenshot
      const initialScreenshot = await this.browser.screenshot();
      screenshots.push(`screenshot-0.png`);
      await this.saveScreenshot(initialScreenshot, screenshots[0]);

      // Use SmartActor to execute the scenario
      if (this.actor) {
        const result = await this.actor.execute({
          url: options.url,
          task: options.scenario,
          timeout: options.timeout,
        });

        // Convert executed steps to test steps
        for (let i = 0; i < result.steps.length; i++) {
          const step = result.steps[i];
          steps.push({
            action: step.description,
            selector: step.selector,
            value: step.value,
            success: step.success,
            duration: 0,
          });
        }

        // Add screenshots
        screenshots.push(...result.screenshots.map((_, i) => `screenshot-${i + 1}.png`));
      }

      // Verify if specified
      if (options.verify && this.actor) {
        // Get current URL asynchronously
        let currentUrl = '';
        try {
          currentUrl = await (this.browser as any).getUrlAsync?.() || options.url;
        } catch {
          currentUrl = options.url;
        }
        
        const verifyResult = await this.actor.execute({
          url: currentUrl,
          task: `Verify that: ${options.verify}`,
        });
        
        const lastStep = steps[steps.length - 1];
        if (lastStep) {
          lastStep.success = verifyResult.success;
        }
      }

      return {
        success: steps.every(s => s.success),
        steps,
        duration: Date.now() - startTime,
        screenshots,
      };
    } catch (error) {
      return {
        success: false,
        steps,
        duration: Date.now() - startTime,
        screenshots,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run visual regression test
   */
  async runVisualTest(options: VisualTestOptions): Promise<VisualTestResult> {
    const startTime = Date.now();
    const results: VisualDiffResult[] = [];

    const baselineDir = options.baselineDir || '.qa-agent/visual/baseline';
    const currentDir = options.currentDir || '.qa-agent/visual/current';
    const diffDir = '.qa-agent/visual/diff';

    // Ensure directories exist
    await this.ensureDir(baselineDir);
    await this.ensureDir(currentDir);
    await this.ensureDir(diffDir);

    try {
      // Navigate to URL
      await this.browser.newPage(options.url);

      // Take full page screenshot
      const screenshot = await this.browser.screenshot({ fullPage: true });

      // Check if baseline exists
      const baselinePath = this.comparator.getBaselinePath(baselineDir, options.name);
      const hasBaseline = await this.comparator.hasBaseline(baselinePath);

      if (!hasBaseline) {
        // Save as baseline
        await this.comparator.saveScreenshot(screenshot, baselinePath);
        results.push({
          name: options.name,
          match: true,
          diffPercentage: 0,
          baselinePath,
          currentPath: baselinePath,
        });
      } else {
        // Compare with baseline
        const currentPath = this.comparator.getCurrentPath(currentDir, options.name);
        const diffPath = this.comparator.getDiffPath(diffDir, options.name);

        await this.comparator.saveScreenshot(screenshot, currentPath);

        const compareResult = await this.comparator.compare({
          baseline: baselinePath,
          current: currentPath,
          threshold: options.threshold || 0.1,
          output: diffPath,
        });

        results.push({
          name: options.name,
          match: compareResult.match,
          diffPercentage: compareResult.diffPercentage,
          baselinePath,
          currentPath,
          diffPath: compareResult.diffPixels > 0 ? diffPath : undefined,
        });
      }

      // Test specific selectors if provided
      if (options.selectors) {
        for (const selector of options.selectors) {
          const selectorName = `${options.name}-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`;
          
          try {
            const elementScreenshot = await this.browser.screenshot({ selector });
            const baselinePath = this.comparator.getBaselinePath(baselineDir, selectorName);
            const hasBaseline = await this.comparator.hasBaseline(baselinePath);

            if (!hasBaseline) {
              await this.comparator.saveScreenshot(elementScreenshot, baselinePath);
              results.push({
                name: selectorName,
                selector,
                match: true,
                diffPercentage: 0,
                baselinePath,
                currentPath: baselinePath,
              });
            } else {
              const currentPath = this.comparator.getCurrentPath(currentDir, selectorName);
              const diffPath = this.comparator.getDiffPath(diffDir, selectorName);

              await this.comparator.saveScreenshot(elementScreenshot, currentPath);

              const compareResult = await this.comparator.compare({
                baseline: baselinePath,
                current: currentPath,
                threshold: options.threshold || 0.1,
                output: diffPath,
              });

              results.push({
                name: selectorName,
                selector,
                match: compareResult.match,
                diffPercentage: compareResult.diffPercentage,
                baselinePath,
                currentPath,
                diffPath: compareResult.diffPixels > 0 ? diffPath : undefined,
              });
            }
          } catch {
            // Skip if element not found
          }
        }
      }

      return {
        passed: results.every(r => r.match),
        results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        passed: false,
        results,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute natural language task
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.actor) {
      await this.launch();
    }

    return await this.actor!.execute(options);
  }

  /**
   * Compare two screenshots
   */
  async compareScreenshots(
    baseline: string | Buffer,
    current: string | Buffer,
    threshold?: number
  ): Promise<CompareResult> {
    return await this.comparator.compare({
      baseline,
      current,
      threshold,
    });
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    await this.browser.click(selector);
  }

  /**
   * Type text
   */
  async type(selector: string, text: string): Promise<void> {
    await this.browser.type(selector, text);
  }

  /**
   * Wait for element
   */
  async waitFor(selector: string): Promise<void> {
    await this.browser.waitFor(selector);
  }

  /**
   * Get page URL
   */
  getUrl(): string {
    return this.browser.getUrl();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.browser.getTitle();
  }

  /**
   * Save screenshot helper
   */
  private async saveScreenshot(buffer: Buffer, filename: string): Promise<void> {
    const dir = '.qa-agent/screenshots';
    await this.ensureDir(dir);
    await fs.promises.writeFile(path.join(dir, filename), buffer);
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }
}

export default GUIAgent;
