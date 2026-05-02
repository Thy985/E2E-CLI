/**
 * Recorder Module
 * Records user interactions for playback
 */

import * as path from 'path';
import * as fs from 'fs';
import { BrowserController } from '../browser';
import { Recording, RecordedStep } from '../types';

export interface RecorderOptions {
  outputDir?: string;
  autoScreenshot?: boolean;
  recordVideo?: boolean;
}

export class Recorder {
  private browser: BrowserController;
  private options: RecorderOptions;
  private recording: Recording | null = null;
  private isRecording = false;

  constructor(browser: BrowserController, options: RecorderOptions = {}) {
    this.browser = browser;
    this.options = {
      outputDir: options.outputDir || '.qa-agent/recordings',
      autoScreenshot: options.autoScreenshot ?? true,
      recordVideo: options.recordVideo ?? false,
    };
  }

  /**
   * Start recording session
   */
  async start(url: string): Promise<void> {
    this.recording = {
      id: `rec-${Date.now()}`,
      url,
      steps: [],
      createdAt: new Date(),
    };
    this.isRecording = true;

    // Navigate to URL
    await this.browser.newPage(url);

    // Record initial navigation
    await this.recordStep({
      type: 'navigate',
      value: url,
      timestamp: Date.now(),
    });
  }

  /**
   * Stop recording and save
   */
  async stop(): Promise<Recording> {
    if (!this.recording) {
      throw new Error('No recording in progress');
    }

    this.isRecording = false;

    // Save recording to file
    await this.saveRecording(this.recording);

    return this.recording;
  }

  /**
   * Record a step
   */
  async recordStep(step: RecordedStep): Promise<void> {
    if (!this.recording || !this.isRecording) {
      return;
    }

    // Add screenshot if enabled
    if (this.options.autoScreenshot) {
      try {
        const screenshot = await this.browser.screenshot();
        step.screenshot = screenshot.toString('base64');
      } catch {
        // Ignore screenshot errors
      }
    }

    this.recording.steps.push(step);
  }

  /**
   * Record click action
   */
  async recordClick(selector: string): Promise<void> {
    await this.recordStep({
      type: 'click',
      selector,
      timestamp: Date.now(),
    });

    // Execute the click
    await this.browser.click(selector);
  }

  /**
   * Record input action
   */
  async recordInput(selector: string, value: string): Promise<void> {
    await this.recordStep({
      type: 'input',
      selector,
      value,
      timestamp: Date.now(),
    });

    // Execute the input
    await this.browser.type(selector, value);
  }

  /**
   * Record navigation
   */
  async recordNavigate(url: string): Promise<void> {
    await this.recordStep({
      type: 'navigate',
      value: url,
      timestamp: Date.now(),
    });

    // Execute navigation
    await this.browser.goto(url);
  }

  /**
   * Record scroll action
   */
  async recordScroll(direction: 'up' | 'down' | 'top' | 'bottom'): Promise<void> {
    await this.recordStep({
      type: 'scroll',
      value: direction,
      timestamp: Date.now(),
    });

    // Execute scroll
    await this.browser.scroll(direction);
  }

  /**
   * Record select action
   */
  async recordSelect(selector: string, value: string): Promise<void> {
    await this.recordStep({
      type: 'select',
      selector,
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Record wait action
   */
  async recordWait(selector: string): Promise<void> {
    await this.recordStep({
      type: 'wait',
      selector,
      timestamp: Date.now(),
    });

    // Execute wait
    await this.browser.waitFor(selector);
  }

  /**
   * Get current recording
   */
  getRecording(): Recording | null {
    return this.recording;
  }

  /**
   * Check if recording is in progress
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Save recording to file
   */
  private async saveRecording(recording: Recording): Promise<string> {
    const outputDir = this.options.outputDir!;
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    // Generate filename
    const filename = `${recording.id}.json`;
    const filepath = path.join(outputDir, filename);

    // Save recording
    await fs.promises.writeFile(filepath, JSON.stringify(recording, null, 2));

    return filepath;
  }

  /**
   * Load recording from file
   */
  static async load(filepath: string): Promise<Recording> {
    const content = await fs.promises.readFile(filepath, 'utf-8');
    const recording = JSON.parse(content) as Recording;
    
    // Convert date string back to Date object
    recording.createdAt = new Date(recording.createdAt);
    
    return recording;
  }

  /**
   * List all recordings
   */
  static async list(outputDir: string = '.qa-agent/recordings'): Promise<string[]> {
    if (!fs.existsSync(outputDir)) {
      return [];
    }

    const files = await fs.promises.readdir(outputDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(outputDir, f));
  }

  /**
   * Export recording to different formats
   */
  static async export(recording: Recording, format: 'json' | 'yaml' | 'playwright'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(recording, null, 2);

      case 'yaml':
        return recordingToYaml(recording);

      case 'playwright':
        return recordingToPlaywright(recording);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

/**
 * Convert recording to YAML format
 */
function recordingToYaml(recording: Recording): string {
  const lines: string[] = [
    `id: ${recording.id}`,
    `url: ${recording.url}`,
    `createdAt: ${recording.createdAt.toISOString()}`,
    `steps:`,
  ];

  for (const step of recording.steps) {
    lines.push(`  - type: ${step.type}`);
    if (step.selector) lines.push(`    selector: "${step.selector}"`);
    if (step.value) lines.push(`    value: "${step.value}"`);
    lines.push(`    timestamp: ${step.timestamp}`);
  }

  return lines.join('\n');
}

/**
 * Convert recording to Playwright test code
 */
function recordingToPlaywright(recording: Recording): string {
  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('${recording.id}', async ({ page }) => {`,
    `  // Navigate to starting URL`,
    `  await page.goto('${recording.url}');`,
    ``,
  ];

  for (const step of recording.steps) {
    switch (step.type) {
      case 'navigate':
        lines.push(`  await page.goto('${step.value}');`);
        break;
      case 'click':
        lines.push(`  await page.click('${step.selector}');`);
        break;
      case 'input':
        lines.push(`  await page.fill('${step.selector}', '${step.value}');`);
        break;
      case 'scroll':
        lines.push(`  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`);
        break;
      case 'wait':
        lines.push(`  await page.waitForSelector('${step.selector}');`);
        break;
      case 'select':
        lines.push(`  await page.selectOption('${step.selector}', '${step.value}');`);
        break;
    }
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}
