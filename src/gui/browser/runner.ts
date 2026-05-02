/**
 * Playwright Runner Script
 * This script runs in Node.js (not Bun) to execute Playwright operations
 * It communicates with the parent process via stdin/stdout JSON messages
 */

import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface BrowserOptions {
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  slowMo?: number;
}

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

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * Send response to parent process
 */
function sendResponse(response: Response): void {
  console.log(JSON.stringify(response));
}

/**
 * Launch browser
 */
async function launchBrowser(params: BrowserOptions): Promise<void> {
  const browserType = params.browser || 'chromium';
  const launchOptions = {
    headless: params.headless ?? true,
    slowMo: params.slowMo || 0,
  };

  switch (browserType) {
    case 'firefox':
      browser = await firefox.launch(launchOptions);
      break;
    case 'webkit':
      browser = await webkit.launch(launchOptions);
      break;
    case 'chromium':
    default:
      browser = await chromium.launch(launchOptions);
  }

  context = await browser.newContext({
    viewport: params.viewport || { width: 1280, height: 720 },
  });
}

/**
 * Navigate to URL
 */
async function navigate(params: { url: string; timeout?: number | string }): Promise<string> {
  if (!context) {
    throw new Error('Browser not launched');
  }

  page = await context.newPage();
  const timeout = typeof params.timeout === 'string' ? parseInt(params.timeout, 10) : (params.timeout || 30000);
  page.setDefaultTimeout(timeout);
  
  await page.goto(params.url, { waitUntil: 'domcontentloaded' });
  
  return page.url();
}

/**
 * Take screenshot
 */
async function takeScreenshot(params: { 
  fullPage?: boolean; 
  selector?: string;
  path?: string;
}): Promise<string> {
  if (!page) {
    throw new Error('No page available');
  }

  const screenshotOptions: any = {
    fullPage: params.fullPage ?? false,
    type: 'png',
  };

  let buffer: Buffer;

  if (params.selector) {
    const element = await page.$(params.selector);
    if (!element) {
      throw new Error(`Element not found: ${params.selector}`);
    }
    buffer = await element.screenshot(screenshotOptions);
  } else {
    buffer = await page.screenshot(screenshotOptions);
  }

  // Return base64 encoded screenshot
  return buffer.toString('base64');
}

/**
 * Click element
 */
async function clickElement(params: { selector: string }): Promise<void> {
  if (!page) {
    throw new Error('No page available');
  }
  await page.click(params.selector);
}

/**
 * Type text
 */
async function typeText(params: { selector: string; text: string; delay?: number }): Promise<void> {
  if (!page) {
    throw new Error('No page available');
  }
  await page.fill(params.selector, params.text);
  if (params.delay) {
    await page.waitForTimeout(params.delay);
  }
}

/**
 * Get page content
 */
async function getContent(): Promise<string> {
  if (!page) {
    throw new Error('No page available');
  }
  return await page.content();
}

/**
 * Get page title
 */
async function getTitle(): Promise<string> {
  if (!page) {
    throw new Error('No page available');
  }
  return await page.title();
}

/**
 * Get page URL
 */
function getUrl(): string {
  if (!page) {
    throw new Error('No page available');
  }
  return page.url();
}

/**
 * Get element info
 */
async function getElementInfo(params: { selector: string }): Promise<any> {
  if (!page) {
    throw new Error('No page available');
  }

  const element = await page.$(params.selector);
  if (!element) {
    return null;
  }

  const boundingBox = await element.boundingBox();
  const isVisible = await element.isVisible();
  const isEnabled = await element.isEnabled();
  
  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
  const text = await element.evaluate(el => el.textContent?.trim() || '');
  const attributes = await element.evaluate(el => {
    const attrs: Record<string, string> = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  });

  return {
    selector: params.selector,
    tagName,
    text,
    attributes,
    isVisible,
    isEnabled,
    boundingBox: boundingBox || undefined,
  };
}

/**
 * Wait for element
 */
async function waitForElement(params: { 
  selector: string; 
  timeout?: number | string; 
  state?: 'visible' | 'hidden' | 'attached' 
}): Promise<void> {
  if (!page) {
    throw new Error('No page available');
  }
  const timeout = typeof params.timeout === 'string' ? parseInt(params.timeout, 10) : (params.timeout || 30000);
  await page.waitForSelector(params.selector, {
    timeout,
    state: params.state || 'visible',
  });
}

/**
 * Execute JavaScript
 */
async function evaluate(params: { script: string }): Promise<any> {
  if (!page) {
    throw new Error('No page available');
  }
  // Use Function constructor to create executable function
  const fn = new Function(params.script);
  return await page.evaluate(fn as any);
}

/**
 * Close browser
 */
async function closeBrowser(): Promise<void> {
  if (page) {
    await page.close();
    page = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
  }
}

/**
 * Process a single command
 */
async function processCommand(command: Command): Promise<Response> {
  try {
    let result: any;
    const params = command.params;

    switch (command.action) {
      case 'launch':
        await launchBrowser(params as BrowserOptions);
        break;
      case 'navigate':
        result = await navigate(params as { url: string; timeout?: number });
        break;
      case 'screenshot':
        result = await takeScreenshot(params as { fullPage?: boolean; selector?: string; path?: string });
        break;
      case 'click':
        await clickElement(params as { selector: string });
        break;
      case 'type':
        await typeText(params as { selector: string; text: string; delay?: number });
        break;
      case 'getContent':
        result = await getContent();
        break;
      case 'getTitle':
        result = await getTitle();
        break;
      case 'getUrl':
        result = getUrl();
        break;
      case 'getElementInfo':
        result = await getElementInfo(params as { selector: string });
        break;
      case 'waitFor':
        await waitForElement(params as { selector: string; timeout?: number; state?: 'visible' | 'hidden' | 'attached' });
        break;
      case 'evaluate':
        result = await evaluate(params as { script: string });
        break;
      case 'close':
        await closeBrowser();
        break;
      default:
        throw new Error(`Unknown action: ${command.action}`);
    }

    return {
      id: command.id,
      success: true,
      result,
    };
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main entry point - read commands from stdin
 */
async function main(): Promise<void> {
  // Process stdin line by line
  let buffer = '';
  
  process.stdin.on('data', async (chunk) => {
    buffer += chunk.toString();
    
    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const command: Command = JSON.parse(line);
        const response = await processCommand(command);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          id: 'unknown',
          success: false,
          error: `Parse error: ${error}`,
        });
      }
    }
  });

  process.stdin.on('end', async () => {
    // Close browser on exit
    await closeBrowser();
    process.exit(0);
  });

  // Send ready signal
  sendResponse({
    id: 'ready',
    success: true,
    result: 'Playwright runner ready',
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
