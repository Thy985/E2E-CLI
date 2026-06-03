/**
 * Smart Actor Module
 * Natural language driven UI operations
 */

import { BrowserController } from '../browser';
import { ModelClient } from '../../types';
import { ExecuteOptions, ExecuteResult, ExecutedStep } from '../types';
import { ErrorRecovery, SmartWait } from '../recovery';
import { getPrompt } from '../../prompts/registry';
import { tryParseJsonTyped, isString, isArrayOf, isObject } from '../../models/schema';

interface ActionPlan {
  steps: ActionStep[];
}

interface ActionStep {
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'wait' | 'press' | 'select';
  description: string;
  selector?: string;
  value?: string;
}

const VALID_ACTIONS: ReadonlyArray<ActionStep['action']> = [
  'click', 'type', 'navigate', 'scroll', 'wait', 'press', 'select',
];

function isActionStep(v: unknown): v is ActionStep {
  if (!isObject(v)) return false;
  if (!isString(v.action)) return false;
  if (!VALID_ACTIONS.includes(v.action as ActionStep['action'])) return false;
  if (!isString(v.description)) return false;
  if (v.selector !== undefined && !isString(v.selector)) return false;
  if (v.value !== undefined && !isString(v.value)) return false;
  return true;
}

export class SmartActor {
  private browser: BrowserController;
  private model: ModelClient;
  private recovery: ErrorRecovery;
  private smartWait: SmartWait;

  constructor(browser: BrowserController, model: ModelClient) {
    this.browser = browser;
    this.model = model;
    this.recovery = new ErrorRecovery(browser, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
    });
    this.smartWait = new SmartWait(browser);
  }

  /**
   * Execute natural language task
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();
    const steps: ExecutedStep[] = [];
    const screenshots: string[] = [];

    try {
      // Navigate to URL
      await this.browser.newPage(options.url);
      
      // Take initial screenshot
      const initialScreenshot = await this.browser.screenshot();
      screenshots.push(`data:image/png;base64,${initialScreenshot.toString('base64')}`);

      // Get page content for context
      const pageContent = await this.browser.getContent();
      const pageTitle = await this.browser.getTitle();

      // Plan actions using LLM
      const plan = await this.planActions(options.task, pageContent, pageTitle);
      
      // If no steps, return failure
      if (plan.steps.length === 0) {
        return {
          success: false,
          steps: [{ description: '无法解析任务', action: 'click', success: false }],
          duration: Date.now() - startTime,
          screenshots,
        };
      }

      // Execute each step
      for (const step of plan.steps) {
        const executedStep = await this.executeStep(step);
        steps.push(executedStep);

        // Take screenshot after each step
        const screenshot = await this.browser.screenshot();
        screenshots.push(`data:image/png;base64,${screenshot.toString('base64')}`);

        if (!executedStep.success) {
          break;
        }
      }

      return {
        success: steps.every(s => s.success),
        steps,
        duration: Date.now() - startTime,
        screenshots,
      };
    } catch (error) {
      console.error('Execute error:', error);
      return {
        success: false,
        steps: steps.length > 0 ? steps : [{ description: '执行失败: ' + (error instanceof Error ? error.message : String(error)), action: 'click', success: false }],
        duration: Date.now() - startTime,
        screenshots,
      };
    }
  }

  /**
   * Plan actions using LLM
   */
  private async planActions(task: string, pageContent: string, pageTitle: string): Promise<ActionPlan> {
    let pageUrl = '';
    try {
      pageUrl = await (this.browser as any).getUrlAsync?.() || '';
    } catch {
      // Ignore
    }

    const prompt = getPrompt('actor-plan', {
      pageTitle,
      pageUrl,
      task,
    });

    let response: string;
    try {
      response = await this.model.chat(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        { json: true }
      );
    } catch (error) {
      console.error('LLM error:', error);
      return {
        steps: [{ action: 'click', description: task, selector: 'a' }],
      };
    }

    const parsed = tryParseJsonTyped(response, (v): v is ActionStep[] => isArrayOf(v, isActionStep));
    if (parsed) return { steps: parsed };

    return {
      steps: [{ action: 'click', description: task, selector: 'a' }],
    };
  }

  /**
   * Execute a single action step
   */
  private async executeStep(step: ActionStep): Promise<ExecutedStep> {
    const executedStep: ExecutedStep = {
      description: step.description,
      action: step.action,
      selector: step.selector,
      value: step.value,
      success: false,
    };

    try {
      switch (step.action) {
        case 'click':
          if (step.selector) {
            // Wait for element to be visible first
            await this.smartWait.waitForElementStable(step.selector, 5000).catch(() => {});
            
            await this.recovery.executeWithRetry(
              'click',
              () => this.browser.click(step.selector!),
              step.selector
            );
            executedStep.success = true;
          }
          break;

        case 'type':
          if (step.selector && step.value !== undefined) {
            await this.recovery.executeWithRetry(
              'type',
              () => this.browser.type(step.selector!, step.value!),
              step.selector
            );
            executedStep.success = true;
          }
          break;

        case 'navigate':
          if (step.value) {
            await this.recovery.executeWithRetry(
              'navigate',
              () => this.browser.goto(step.value!)
            );
            // Wait for page to be ready
            await this.smartWait.waitForPageReady();
            executedStep.success = true;
          }
          break;

        case 'scroll':
          await this.browser.scroll((step.value as 'up' | 'down' | 'top' | 'bottom') || 'down');
          executedStep.success = true;
          break;

        case 'wait':
          if (step.selector) {
            await this.recovery.executeWithRetry(
              'wait',
              () => this.browser.waitFor(step.selector!),
              step.selector
            );
            executedStep.success = true;
          }
          break;

        case 'press':
          if (step.value) {
            await this.browser.press(step.value);
            executedStep.success = true;
          }
          break;

        case 'select':
          // TODO: Implement select
          break;
      }
    } catch (error) {
      executedStep.success = false;
    }

    return executedStep;
  }

  /**
   * Find element by description
   */
  async findElement(description: string): Promise<string | null> {
    const prompt = getPrompt('selector-suggest', { description });

    const response = await this.model.chat(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      { temperature: 0.1 }
    );

    const selector = response.trim().split('\n')[0];

    try {
      const info = await this.browser.getElementInfo(selector);
      return info ? selector : null;
    } catch {
      return null;
    }
  }
}
