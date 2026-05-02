/**
 * Player Module
 * Plays back recorded interactions
 */

import * as path from 'path';
import * as fs from 'fs';
import { BrowserController } from '../browser';
import { Recording, RecordedStep } from '../types';

export interface PlayerOptions {
  slowMo?: number;
  timeout?: number;
  screenshotOnFailure?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

export interface PlaybackResult {
  success: boolean;
  recordingId: string;
  executedSteps: number;
  totalSteps: number;
  duration: number;
  errors: PlaybackError[];
  screenshots: string[];
}

export interface PlaybackError {
  stepIndex: number;
  step: RecordedStep;
  error: string;
  screenshot?: string;
}

export class Player {
  private browser: BrowserController;
  private options: PlayerOptions;

  constructor(browser: BrowserController, options: PlayerOptions = {}) {
    this.browser = browser;
    this.options = {
      slowMo: options.slowMo || 0,
      timeout: options.timeout || 30000,
      screenshotOnFailure: options.screenshotOnFailure ?? true,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
    };
  }

  /**
   * Play a recording
   */
  async play(recording: Recording): Promise<PlaybackResult> {
    const startTime = Date.now();
    const errors: PlaybackError[] = [];
    const screenshots: string[] = [];
    let executedSteps = 0;

    try {
      // Navigate to starting URL
      await this.browser.newPage(recording.url);

      // Execute each step
      for (let i = 0; i < recording.steps.length; i++) {
        const step = recording.steps[i];

        try {
          await this.executeStep(step);
          executedSteps++;

          // Take screenshot after each step
          const screenshot = await this.browser.screenshot();
          screenshots.push(`data:image/png;base64,${screenshot.toString('base64')}`);

          // Apply slow motion delay
          if (this.options.slowMo && i < recording.steps.length - 1) {
            await this.delay(this.options.slowMo);
          }
        } catch (error) {
          const playbackError: PlaybackError = {
            stepIndex: i,
            step,
            error: error instanceof Error ? error.message : String(error),
          };

          // Take screenshot on failure
          if (this.options.screenshotOnFailure) {
            try {
              const screenshot = await this.browser.screenshot();
              playbackError.screenshot = screenshot.toString('base64');
            } catch {
              // Ignore screenshot errors
            }
          }

          errors.push(playbackError);
          break;
        }
      }

      return {
        success: errors.length === 0,
        recordingId: recording.id,
        executedSteps,
        totalSteps: recording.steps.length,
        duration: Date.now() - startTime,
        errors,
        screenshots,
      };
    } catch (error) {
      return {
        success: false,
        recordingId: recording.id,
        executedSteps,
        totalSteps: recording.steps.length,
        duration: Date.now() - startTime,
        errors: [{
          stepIndex: -1,
          step: { type: 'navigate', value: recording.url, timestamp: Date.now() },
          error: error instanceof Error ? error.message : String(error),
        }],
        screenshots,
      };
    }
  }

  /**
   * Play a recording with retry
   */
  async playWithRetry(recording: Recording): Promise<PlaybackResult> {
    let lastResult: PlaybackResult | null = null;

    for (let attempt = 1; attempt <= this.options.retryCount!; attempt++) {
      const result = await this.play(recording);
      
      if (result.success) {
        return result;
      }

      lastResult = result;

      // Wait before retry
      if (attempt < this.options.retryCount!) {
        await this.delay(this.options.retryDelay! * attempt);
      }
    }

    return lastResult!;
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: RecordedStep): Promise<void> {
    switch (step.type) {
      case 'navigate':
        await this.browser.goto(step.value!);
        break;

      case 'click':
        await this.browser.click(step.selector!);
        break;

      case 'input':
        await this.browser.type(step.selector!, step.value!);
        break;

      case 'scroll':
        await this.browser.scroll(step.value as 'up' | 'down' | 'top' | 'bottom');
        break;

      case 'wait':
        await this.browser.waitFor(step.selector!);
        break;

      case 'select':
        // TODO: Implement select
        throw new Error('Select action not yet implemented');

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Play from file
   */
  static async playFromFile(
    browser: BrowserController,
    filepath: string,
    options?: PlayerOptions
  ): Promise<PlaybackResult> {
    const content = await fs.promises.readFile(filepath, 'utf-8');
    const recording = JSON.parse(content) as Recording;
    recording.createdAt = new Date(recording.createdAt);

    const player = new Player(browser, options);
    return await player.play(recording);
  }

  /**
   * Validate a recording
   */
  static validate(recording: Recording): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!recording.id) {
      errors.push('Recording missing id');
    }

    if (!recording.url) {
      errors.push('Recording missing url');
    }

    if (!Array.isArray(recording.steps)) {
      errors.push('Recording missing steps array');
      return { valid: false, errors };
    }

    for (let i = 0; i < recording.steps.length; i++) {
      const step = recording.steps[i];

      if (!step.type) {
        errors.push(`Step ${i} missing type`);
        continue;
      }

      switch (step.type) {
        case 'navigate':
          if (!step.value) {
            errors.push(`Step ${i} (navigate) missing value (URL)`);
          }
          break;
        case 'click':
        case 'input':
        case 'wait':
          if (!step.selector) {
            errors.push(`Step ${i} (${step.type}) missing selector`);
          }
          if (step.type === 'input' && !step.value) {
            errors.push(`Step ${i} (input) missing value`);
          }
          break;
        case 'scroll':
          if (!step.value || !['up', 'down', 'top', 'bottom'].includes(step.value)) {
            errors.push(`Step ${i} (scroll) invalid value: ${step.value}`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
