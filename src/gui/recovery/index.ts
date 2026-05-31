/**
 * Error Recovery Module
 * Provides smart retry and recovery strategies
 */

import { BrowserController } from '../browser';

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RecoveryContext {
  attempt: number;
  error: Error;
  selector?: string;
  action: string;
}

export interface RecoveryStrategy {
  name: string;
  canRecover: (context: RecoveryContext) => boolean;
  recover: (browser: BrowserController, context: RecoveryContext) => Promise<boolean>;
}

export class ErrorRecovery {
  private browser: BrowserController;
  private options: RetryOptions;
  private strategies: RecoveryStrategy[] = [];

  constructor(browser: BrowserController, options: Partial<RetryOptions> = {}) {
    this.browser = browser;
    this.options = {
      maxRetries: options.maxRetries || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 10000,
      backoffMultiplier: options.backoffMultiplier || 2,
    };

    // Register default strategies
    this.registerDefaultStrategies();
  }

  /**
   * Execute action with retry
   */
  async executeWithRetry<T>(
    action: string,
    fn: () => Promise<T>,
    selector?: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.options.initialDelay;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const context: RecoveryContext = {
          attempt,
          error: lastError,
          selector,
          action,
        };

        // Try recovery strategies
        let recovered = false;
        for (const strategy of this.strategies) {
          if (strategy.canRecover(context)) {
            recovered = await strategy.recover(this.browser, context);
            if (recovered) break;
          }
        }

        // If not recovered and not last attempt, wait before retry
        if (!recovered && attempt < this.options.maxRetries) {
          await this.delay(delay);
          delay = Math.min(delay * this.options.backoffMultiplier, this.options.maxDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Register default recovery strategies
   */
  private registerDefaultStrategies(): void {
    // Strategy 1: Wait and retry for timeout errors
    this.registerStrategy({
      name: 'timeout-wait',
      canRecover: (ctx) => 
        ctx.error.message.includes('timeout') || 
        ctx.error.message.includes('Timeout'),
      recover: async (browser) => {
        await this.delay(2000);
        return true;
      },
    });

    // Strategy 2: Try alternative selectors
    this.registerStrategy({
      name: 'alternative-selector',
      canRecover: (ctx) => 
        ctx.selector !== undefined && 
        (ctx.error.message.includes('not found') || 
         ctx.error.message.includes('not visible')),
      recover: async (browser, ctx) => {
        if (!ctx.selector) return false;

        // Generate alternative selectors
        const alternatives = this.generateAlternativeSelectors(ctx.selector);
        
        for (const alt of alternatives) {
          try {
            const info = await browser.getElementInfo(alt);
            if (info && info.isVisible) {
              return true;
            }
          } catch {
            continue;
          }
        }

        return false;
      },
    });

    // Strategy 3: Scroll into view
    this.registerStrategy({
      name: 'scroll-into-view',
      canRecover: (ctx) => 
        ctx.selector !== undefined && 
        ctx.error.message.includes('not visible'),
      recover: async (browser, ctx) => {
        if (!ctx.selector) return false;

        try {
          await browser.evaluate(() => {
            const el = document.querySelector(ctx.selector!);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          await this.delay(500);
          return true;
        } catch {
          return false;
        }
      },
    });

    // Strategy 4: Wait for page load
    this.registerStrategy({
      name: 'wait-page-load',
      canRecover: (ctx) => 
        ctx.error.message.includes('detached') || 
        ctx.error.message.includes('stale'),
      recover: async (browser) => {
        await this.delay(1000);
        return true;
      },
    });
  }

  /**
   * Generate alternative selectors
   */
  private generateAlternativeSelectors(selector: string): string[] {
    const alternatives: string[] = [];

    // If it's an ID selector, try class or attribute
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      alternatives.push(`[id="${id}"]`);
      alternatives.push(`*[id="${id}"]`);
    }

    // If it's a class selector, try partial match
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      alternatives.push(`[class*="${className}"]`);
    }

    // If it contains >, try descendant selector
    if (selector.includes('>')) {
      alternatives.push(selector.replace(/>/g, ''));
    }

    // Try with nth-child
    if (!selector.includes(':nth')) {
      alternatives.push(`${selector}:first-child`);
    }

    return alternatives;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Smart Wait Module
 * Provides intelligent waiting strategies
 */
export class SmartWait {
  private browser: BrowserController;

  constructor(browser: BrowserController) {
    this.browser = browser;
  }

  /**
   * Wait for page to be ready
   */
  async waitForPageReady(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const ready = await this.browser.evaluate(() => {
        return document.readyState === 'complete' && 
               !document.querySelector('.loading') &&
               !document.querySelector('[aria-busy="true"]');
      });

      if (ready) return;
      await this.delay(100);
    }

    throw new Error('Page not ready within timeout');
  }

  /**
   * Wait for network idle
   */
  async waitForNetworkIdle(timeout: number = 30000): Promise<void> {
    // Simple implementation - wait for no pending requests
    const startTime = Date.now();
    let lastRequestCount = 0;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      const requestCount = await this.browser.evaluate(() => {
        return (window as any).__pendingRequests || 0;
      });

      if (requestCount === lastRequestCount) {
        stableCount++;
        if (stableCount >= 5) return;
      } else {
        stableCount = 0;
        lastRequestCount = requestCount;
      }

      await this.delay(200);
    }

    throw new Error('Network not idle within timeout');
  }

  /**
   * Wait for element to be stable (not moving)
   */
  async waitForElementStable(selector: string, timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    let lastPosition: { x: number; y: number } | null = null;
    let stableCount = 0;

    while (Date.now() - startTime < timeout) {
      const info = await this.browser.getElementInfo(selector);
      
      if (!info || !info.boundingBox) {
        await this.delay(100);
        continue;
      }

      const currentPos = { x: info.boundingBox.x, y: info.boundingBox.y };

      if (lastPosition && 
          currentPos.x === lastPosition.x && 
          currentPos.y === lastPosition.y) {
        stableCount++;
        if (stableCount >= 3) return;
      } else {
        stableCount = 0;
      }

      lastPosition = currentPos;
      await this.delay(100);
    }

    throw new Error('Element not stable within timeout');
  }

  /**
   * Wait for text to appear
   */
  async waitForText(text: string, timeout: number = 10000): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const content = await this.browser.getContent();
      
      if (content.includes(text)) {
        // Try to find the element with this text
        const selector = await this.browser.evaluate(() => {
          const elements = document.querySelectorAll('*');
          for (const el of elements) {
            if (el.textContent?.includes(text)) {
              if (el.id) return `#${el.id}`;
              if (el.className) {
                const classes = el.className.split(' ').filter((c: string) => c).join('.');
                if (classes) return `.${classes}`;
              }
              return el.tagName.toLowerCase();
            }
          }
          return null;
        });

        if (selector) return selector;
      }
      
      await this.delay(200);
    }

    throw new Error(`Text "${text}" not found within timeout`);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
