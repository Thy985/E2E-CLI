/**
 * Browser Controller
 * Uses a Node.js subprocess to run Playwright operations (for Bun compatibility)
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserType, GUIAgentOptions, ScreenshotOptions, ElementInfo } from '../types';

interface Command {
  id: string;
  action: string;
  params: Record<string, any>;
}

interface Response {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

export class BrowserController {
  private process: ChildProcess | null = null;
  private options: GUIAgentOptions;
  private commandId = 0;
  private pendingCommands = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  constructor(options: GUIAgentOptions = {}) {
    this.options = {
      browser: options.browser || 'chromium',
      headless: options.headless ?? true,
      viewport: options.viewport || { width: 1280, height: 720 },
      timeout: options.timeout || 30000,
      slowMo: options.slowMo || 0,
    };
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Start the Node.js subprocess
   */
  private async startProcess(): Promise<void> {
    if (this.process) return;

    const runnerPath = path.join(__dirname, 'runner.ts');
    
    // Use npx tsx to run the TypeScript runner in Node.js
    // Use double quotes for paths with spaces on Windows
    this.process = spawn('npx', ['tsx', `"${runnerPath}"`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Ensure Node.js is used
        NODE_OPTIONS: '--no-warnings',
      },
    });

    // Handle stdout (responses)
    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const response: Response = JSON.parse(line);
          
          // Handle ready signal
          if (response.id === 'ready') {
            this.isReady = true;
            this.readyResolve();
            continue;
          }
          
          // Handle command response
          const pending = this.pendingCommands.get(response.id);
          if (pending) {
            this.pendingCommands.delete(response.id);
            if (response.success) {
              pending.resolve(response.result);
            } else {
              pending.reject(new Error(response.error || 'Unknown error'));
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    });

    // Handle stderr (errors)
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('Playwright runner error:', data.toString());
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      this.process = null;
      this.isReady = false;
      
      // Reject all pending commands
      for (const [id, pending] of this.pendingCommands) {
        pending.reject(new Error('Browser process exited'));
        this.pendingCommands.delete(id);
      }
    });

    // Wait for ready signal
    await this.readyPromise;
  }

  /**
   * Send command to subprocess and wait for response
   */
  private async sendCommand<T = any>(action: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.process || !this.isReady) {
      await this.startProcess();
    }

    const id = `cmd-${++this.commandId}`;
    const command: Command = { id, action, params };

    return new Promise<T>((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject });
      
      // Send command
      this.process?.stdin?.write(JSON.stringify(command) + '\n');
      
      // Set timeout
      const timeout = this.options.timeout || 30000;
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${action}`));
        }
      }, timeout);
    });
  }

  /**
   * Launch browser
   */
  async launch(): Promise<void> {
    await this.startProcess();
    await this.sendCommand('launch', {
      browser: this.options.browser,
      headless: this.options.headless,
      viewport: this.options.viewport,
      timeout: this.options.timeout,
      slowMo: this.options.slowMo,
    });
  }

  /**
   * Create new page and navigate to URL
   */
  async newPage(url: string): Promise<string> {
    return await this.sendCommand<string>('navigate', {
      url,
      timeout: this.options.timeout,
    });
  }

  /**
   * Navigate to URL
   */
  async goto(url: string): Promise<string> {
    return await this.sendCommand<string>('navigate', {
      url,
      timeout: this.options.timeout,
    });
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    await this.sendCommand('click', { selector });
  }

  /**
   * Type text into input
   */
  async type(selector: string, text: string, options?: { delay?: number }): Promise<void> {
    await this.sendCommand('type', {
      selector,
      text,
      delay: options?.delay,
    });
  }

  /**
   * Press key
   */
  async press(key: string): Promise<void> {
    // Use evaluate to press key
    await this.sendCommand('evaluate', {
      script: `() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}' }))`,
    });
  }

  /**
   * Scroll page
   */
  async scroll(direction: 'up' | 'down' | 'top' | 'bottom', distance?: number): Promise<void> {
    const scrollDistance = distance || 300;
    
    let script: string;
    switch (direction) {
      case 'top':
        script = '() => window.scrollTo(0, 0)';
        break;
      case 'bottom':
        script = '() => window.scrollTo(0, document.body.scrollHeight)';
        break;
      case 'up':
        script = `() => window.scrollBy(0, -${scrollDistance})`;
        break;
      case 'down':
        script = `() => window.scrollBy(0, ${scrollDistance})`;
        break;
    }
    
    await this.sendCommand('evaluate', { script });
  }

  /**
   * Wait for element
   */
  async waitFor(selector: string, options?: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' }): Promise<void> {
    await this.sendCommand('waitFor', {
      selector,
      timeout: options?.timeout || this.options.timeout,
      state: options?.state || 'visible',
    });
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(options?: { timeout?: number }): Promise<void> {
    // Simple wait - in real implementation would wait for load state
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Take screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    const base64 = await this.sendCommand<string>('screenshot', {
      fullPage: options.fullPage,
      selector: options.selector,
    });
    
    return Buffer.from(base64, 'base64');
  }

  /**
   * Get page content
   */
  async getContent(): Promise<string> {
    return await this.sendCommand<string>('getContent');
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.sendCommand<string>('getTitle');
  }

  /**
   * Get page URL
   */
  getUrl(): string {
    // This is synchronous in the original, but we need to make it async
    // For now, return empty string and use async methods
    return '';
  }

  /**
   * Get page URL (async version)
   */
  async getUrlAsync(): Promise<string> {
    return await this.sendCommand<string>('getUrl');
  }

  /**
   * Get element info
   */
  async getElementInfo(selector: string): Promise<ElementInfo | null> {
    return await this.sendCommand<ElementInfo | null>('getElementInfo', { selector });
  }

  /**
   * Find elements by text
   */
  async findByText(text: string): Promise<string[]> {
    // Use evaluate to find elements
    const result = await this.sendCommand<any[]>('evaluate', {
      script: `() => {
        const elements = document.querySelectorAll('*');
        const found = [];
        elements.forEach((el, i) => {
          if (el.textContent?.includes('${text}')) {
            found.push(i);
          }
        });
        return found;
      }`,
    });
    
    return result.map((i: number) => `:nth-match(*, ${i + 1})`);
  }

  /**
   * Find elements by role
   */
  async findByRole(role: string, name?: string): Promise<string[]> {
    // Use evaluate to find elements by role
    const result = await this.sendCommand<any[]>('evaluate', {
      script: `() => {
        const elements = document.querySelectorAll('[role="${role}"]');
        const found = [];
        elements.forEach((el, i) => {
          ${name ? `if (el.getAttribute('aria-label')?.includes('${name}') || el.textContent?.includes('${name}'))` : ''}
          found.push(i);
        });
        return found;
      }`,
    });
    
    return result.map((i: number) => `[role="${role}"] >> nth=${i}`);
  }

  /**
   * Execute JavaScript
   */
  async evaluate<T>(fn: () => T): Promise<T> {
    return await this.sendCommand<T>('evaluate', {
      script: fn.toString(),
    });
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.process) {
      await this.sendCommand('close');
      
      // Kill the process
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.process !== null && this.isReady;
  }
}
