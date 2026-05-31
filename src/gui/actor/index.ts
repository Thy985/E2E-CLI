/**
 * Smart Actor Module
 * Natural language driven UI operations
 */

import { BrowserController } from '../browser';
import { ModelClient } from '../../types';
import { ExecuteOptions, ExecuteResult, ExecutedStep } from '../types';
import { ErrorRecovery, SmartWait } from '../recovery';

interface ActionPlan {
  steps: ActionStep[];
}

interface ActionStep {
  action: 'click' | 'type' | 'navigate' | 'scroll' | 'wait' | 'press' | 'select';
  description: string;
  selector?: string;
  value?: string;
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
    // Get URL asynchronously if available
    let pageUrl = '';
    try {
      pageUrl = await (this.browser as any).getUrlAsync?.() || '';
    } catch {
      // Ignore
    }

    const prompt = `You are a browser automation expert. Analyze the task and create a step-by-step plan.

Page Title: ${pageTitle}
Page URL: ${pageUrl}

Task: ${task}

Available actions:
- click: Click on an element (requires selector)
- type: Type text into an input (requires selector and value)
- navigate: Navigate to a URL (requires value as URL)
- scroll: Scroll the page (value: "up", "down", "top", "bottom")
- wait: Wait for an element (requires selector)
- press: Press a key (value: key name like "Enter", "Escape")
- select: Select an option from dropdown (requires selector and value)

Respond with a JSON array of steps:
[
  {"action": "click", "description": "Click login button", "selector": "button[type='submit']"},
  {"action": "type", "description": "Enter username", "selector": "#username", "value": "admin"}
]

Only respond with the JSON array, no other text.`;

    let response: string;
    try {
      response = await this.model.chat([
        { role: 'system', content: 'You are a browser automation expert that outputs JSON.' },
        { role: 'user', content: prompt },
      ]);
    } catch (error) {
      console.error('LLM error:', error);
      // Return a simple click plan as fallback
      return {
        steps: [
          { action: 'click', description: task, selector: 'a' }
        ]
      };
    }

    // Parse response
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const steps = JSON.parse(jsonMatch[0]) as ActionStep[];
        return { steps };
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
    }

    // Return a simple click plan as fallback
    return {
      steps: [
        { action: 'click', description: task, selector: 'a' }
      ]
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
    const prompt = `Given the following element description, suggest the best CSS selector.

Element description: ${description}

Respond with only the CSS selector, nothing else.`;

    const response = await this.model.chat([
      { role: 'user', content: prompt },
    ]);

    const selector = response.trim().split('\n')[0];
    
    // Validate selector
    try {
      const info = await this.browser.getElementInfo(selector);
      return info ? selector : null;
    } catch {
      return null;
    }
  }
}
