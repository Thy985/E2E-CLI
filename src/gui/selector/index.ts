/**
 * Selector Generator
 * Automatically generates stable selectors for elements
 */

import { BrowserController } from '../browser';

export interface SelectorCandidate {
  selector: string;
  type: 'id' | 'class' | 'attribute' | 'text' | 'role' | 'css';
  confidence: number;
  description: string;
}

export interface ElementLocator {
  primary: string;
  alternatives: string[];
  confidence: number;
  elementInfo: {
    tagName: string;
    text?: string;
    attributes: Record<string, string>;
  };
}

export class SelectorGenerator {
  private browser: BrowserController;

  constructor(browser: BrowserController) {
    this.browser = browser;
  }

  /**
   * Generate selectors for an element
   */
  async generateSelectors(selector: string): Promise<ElementLocator> {
    const elementInfo = await this.browser.getElementInfo(selector);
    
    if (!elementInfo) {
      throw new Error(`Element not found: ${selector}`);
    }

    const candidates: SelectorCandidate[] = [];

    // Strategy 1: ID selector (highest confidence)
    if (elementInfo.attributes.id) {
      candidates.push({
        selector: `#${elementInfo.attributes.id}`,
        type: 'id',
        confidence: 0.95,
        description: `ID: ${elementInfo.attributes.id}`,
      });
    }

    // Strategy 2: data-testid or data-cy (test attributes)
    const testId = elementInfo.attributes['data-testid'] || elementInfo.attributes['data-cy'];
    if (testId) {
      candidates.push({
        selector: `[data-testid="${testId}"]`,
        type: 'attribute',
        confidence: 0.9,
        description: `Test ID: ${testId}`,
      });
    }

    // Strategy 3: aria-label or aria-labelledby
    if (elementInfo.attributes['aria-label']) {
      candidates.push({
        selector: `[aria-label="${elementInfo.attributes['aria-label']}"]`,
        type: 'attribute',
        confidence: 0.85,
        description: `ARIA label: ${elementInfo.attributes['aria-label']}`,
      });
    }

    // Strategy 4: Role-based selector
    const role = elementInfo.attributes.role || this.inferRole(elementInfo.tagName);
    if (role && elementInfo.text) {
      candidates.push({
        selector: `role=${role}[name="${elementInfo.text.slice(0, 50)}"]`,
        type: 'role',
        confidence: 0.8,
        description: `Role: ${role}`,
      });
    }

    // Strategy 5: Text content
    if (elementInfo.text && elementInfo.text.length < 50) {
      candidates.push({
        selector: `text="${elementInfo.text}"`,
        type: 'text',
        confidence: 0.75,
        description: `Text: ${elementInfo.text}`,
      });
    }

    // Strategy 6: Unique class combination
    if (elementInfo.attributes.class) {
      const classes = elementInfo.attributes.class.split(' ').filter(c => 
        c && !this.isGenericClass(c)
      );
      
      if (classes.length > 0) {
        const classSelector = classes.map(c => `.${c}`).join('');
        candidates.push({
          selector: `${elementInfo.tagName}${classSelector}`,
          type: 'class',
          confidence: 0.7,
          description: `Classes: ${classes.join(', ')}`,
        });
      }
    }

    // Strategy 7: Attribute combination
    const stableAttrs = ['name', 'type', 'placeholder', 'title', 'href'];
    for (const attr of stableAttrs) {
      if (elementInfo.attributes[attr]) {
        candidates.push({
          selector: `${elementInfo.tagName}[${attr}="${elementInfo.attributes[attr]}"]`,
          type: 'attribute',
          confidence: 0.65,
          description: `${attr}: ${elementInfo.attributes[attr]}`,
        });
      }
    }

    // Strategy 8: CSS path (lowest confidence but always available)
    const cssPath = await this.generateCssPath(selector);
    candidates.push({
      selector: cssPath,
      type: 'css',
      confidence: 0.5,
      description: 'CSS path',
    });

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Validate selectors
    const validCandidates: SelectorCandidate[] = [];
    for (const candidate of candidates) {
      const isValid = await this.validateSelector(candidate.selector);
      if (isValid) {
        validCandidates.push(candidate);
      }
    }

    return {
      primary: validCandidates[0]?.selector || selector,
      alternatives: validCandidates.slice(1, 4).map(c => c.selector),
      confidence: validCandidates[0]?.confidence || 0,
      elementInfo: {
        tagName: elementInfo.tagName,
        text: elementInfo.text,
        attributes: elementInfo.attributes,
      },
    };
  }

  /**
   * Infer role from tag name
   */
  private inferRole(tagName: string): string | null {
    const roleMap: Record<string, string> = {
      button: 'button',
      a: 'link',
      input: 'textbox',
      select: 'combobox',
      textarea: 'textbox',
      img: 'img',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      nav: 'navigation',
      main: 'main',
      header: 'banner',
      footer: 'contentinfo',
      form: 'form',
      table: 'table',
      ul: 'list',
      ol: 'list',
    };

    return roleMap[tagName] || null;
  }

  /**
   * Check if class is generic/unstable
   */
  private isGenericClass(className: string): boolean {
    const genericPatterns = [
      /^(css-|sc-|emotion-)/,  // CSS-in-JS
      /^(styles_|_)/,           // Styled components
      /^(Mui|jss)/,             // Material-UI
      /^(ant-)/,                // Ant Design
      /^[a-z]{1,2}$/,           // Very short classes
      /^[A-Z]+$/,               // All uppercase
    ];

    return genericPatterns.some(p => p.test(className));
  }

  /**
   * Generate CSS path for element
   */
  private async generateCssPath(selector: string): Promise<string> {
    const result = await this.browser.evaluate(() => {
      const el = document.querySelector(selector);
      if (!el) return selector;

      const path: string[] = [];
      let current: Element | null = el;

      while (current && current !== document.documentElement) {
        let segment = current.tagName.toLowerCase();
        
        // Add nth-child if needed
        const parentEl = current.parentElement as Element | null;
        if (parentEl) {
          const siblings = Array.from(parentEl.children);
          const sameTagSiblings = siblings.filter(
            (c) => c.tagName === current!.tagName
          );
          if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            segment += `:nth-of-type(${index})`;
          }
        }

        path.unshift(segment);
        current = parentEl;

        // Stop at ID
        if (current && current.id) {
          path.unshift(`#${current.id}`);
          break;
        }
      }

      return path.join(' > ');
    });
    
    return result as string;
  }

  /**
   * Validate selector
   */
  private async validateSelector(selector: string): Promise<boolean> {
    try {
      const info = await this.browser.getElementInfo(selector);
      return info !== null && info.isVisible;
    } catch {
      return false;
    }
  }

  /**
   * Generate locator for all interactive elements on page
   */
  async generatePageLocators(): Promise<ElementLocator[]> {
    const interactiveSelectors = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[tabindex]:not([tabindex="-1"])',
    ];

    const locators: ElementLocator[] = [];

    for (const selector of interactiveSelectors) {
      try {
        const elements = await this.browser.evaluate(() => {
          const els = document.querySelectorAll(selector);
          return Array.from(els).map((el, i) => ({
            index: i,
            tagName: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 50),
            id: el.id,
            className: el.className,
          }));
        }) as Array<{ index: number; tagName: string; text?: string; id?: string; className?: string }>;

        for (const el of elements) {
          const elementSelector = el.id 
            ? `#${el.id}` 
            : `${selector}:nth-of-type(${el.index + 1})`;
          
          try {
            const locator = await this.generateSelectors(elementSelector);
            locators.push(locator);
          } catch {
            // Skip elements that can't be located
          }
        }
      } catch {
        // Skip invalid selectors
      }
    }

    return locators;
  }
}
