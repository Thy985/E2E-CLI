/**
 * GUI Actor prompt templates
 *
 * 用法：浏览器自动化场景下，让 LLM 把自然语言任务拆成步骤。
 */

import { registerPrompt, type PromptTemplate } from './index';

const ACTOR_PLAN_SYSTEM = `You are a browser automation expert. Translate a natural-language task into a JSON array of steps.

Available actions (use exactly these names):
- "click"       (requires selector)
- "type"        (requires selector and value)
- "navigate"    (requires value as URL)
- "scroll"      (value: "up" | "down" | "top" | "bottom")
- "wait"        (requires selector)
- "press"       (value: key name like "Enter", "Escape")
- "select"      (requires selector and value, for <select> dropdowns)

Rules:
- Output ONLY a JSON array, no prose, no markdown.
- Each step: {"action":"...","description":"...","selector":"...","value":"..."}
- selector and value are optional and only included when the action requires them.
- If the task is impossible from current page state, return a single step {"action":"click","description":"<task>","selector":"a"}.`;

const ACTOR_PLAN_USER = `Current page:
- Title: {{pageTitle}}
- URL: {{pageUrl}}

Task: {{task}}

Output the JSON array of steps.`;

const SELECTOR_SYSTEM = `You are a CSS selector expert. Given an element description, output the most robust CSS selector.

Rules:
- Prefer stable attributes: data-testid, id, name, role.
- Use semantic selectors over positional ones.
- Output ONLY the selector, no prose.`;

const SELECTOR_USER = `Element description: {{description}}

Respond with only the CSS selector.`;

const templates: PromptTemplate[] = [
  {
    id: 'actor-plan',
    version: '1.0.0',
    system: ACTOR_PLAN_SYSTEM,
    user: ACTOR_PLAN_USER,
    expectJson: true,
    jsonSchema: 'ActionStep[]',
  },
  {
    id: 'selector-suggest',
    version: '1.0.0',
    system: SELECTOR_SYSTEM,
    user: SELECTOR_USER,
    expectJson: false,
  },
];

for (const t of templates) registerPrompt(t);
