/**
 * Configuration System
 * Supports .qa-agent/config.yaml, .qa-agent/config.json, qa.config.ts
 */

import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { matchesAnyPattern } from '../utils/ignore';

export interface QAConfig {
  version: number;
  project?: {
    name?: string;
    type?: 'webapp' | 'library' | 'cli' | 'api';
    framework?: string;
  };
  skills?: {
    enabled?: string[];
    disabled?: string[];
    config?: Record<string, SkillConfig>;
  };
  model?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  output?: {
    format?: 'html' | 'json' | 'markdown' | 'compact';
    path?: string;
  };
  ignore?: string[];
  rules?: Record<string, RuleConfig>;
  /** Failure threshold: 'critical' (default) or 'warning' */
  failOn?: 'critical' | 'warning';
  thresholds?: {
    score?: {
      warning?: number;
      error?: number;
    };
    severity?: {
      critical?: number;
      warning?: number;
    };
  };
}

export interface SkillConfig {
  enabled?: boolean;
  rules?: Record<string, RuleConfig>;
}

export interface RuleConfig {
  enabled?: boolean;
  severity?: 'critical' | 'warning' | 'info';
  options?: Record<string, unknown>;
}

const DEFAULT_CONFIG: QAConfig = {
  version: 1,
  skills: {
    enabled: ['a11y', 'e2e', 'performance', 'security', 'ui-ux'],
    disabled: [],
    config: {},
  },
  output: {
    format: 'compact',
    path: '.qa-agent/reports',
  },
  ignore: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '**/*.min.js',
    '**/*.d.ts',
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],
  thresholds: {
    score: {
      warning: 70,
      error: 50,
    },
    severity: {
      critical: 1,
      warning: 10,
    },
  },
};

const CONFIG_FILES = [
  '.qa-agent/config.yaml',
  '.qa-agent/config.yml',
  '.qa-agent/config.json',
  'qa.config.ts',
  'qa.config.js',
  '.qarc.json',
];

/**
 * Load configuration from project directory
 */
export async function loadConfig(projectPath: string): Promise<QAConfig> {
  const configPath = await findConfigFile(projectPath);

  if (!configPath) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const config = await parseConfigFile(configPath);
    return mergeConfig(DEFAULT_CONFIG, config);
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}:`, error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Find config file in project directory
 */
async function findConfigFile(projectPath: string): Promise<string | null> {
  for (const file of CONFIG_FILES) {
    const fullPath = path.join(projectPath, file);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Parse config file based on extension
 */
async function parseConfigFile(filePath: string): Promise<QAConfig> {
  const ext = path.extname(filePath);
  const content = await fs.readFile(filePath, 'utf-8');

  switch (ext) {
    case '.yaml':
    case '.yml':
      return parseYaml(content);
    case '.json':
      return JSON.parse(content);
    case '.ts':
    case '.js':
      return parseJsConfig(filePath);
    default:
      return JSON.parse(content);
  }
}

/**
 * Parse YAML config (simple implementation)
 */
function parseYaml(content: string): QAConfig {
  // Try the runtime's built-in YAML parser first. Bun.YAML exists in some
  // Bun versions; on Node we look for a user-installed `yaml` package.
  // Falls back to a hand-rolled parser for the small subset we need.
  try {
    const bunYaml = (globalThis as { Bun?: { YAML?: { parse: (s: string) => unknown } } }).Bun?.YAML;
    if (bunYaml) return (bunYaml.parse(content) as QAConfig) ?? {};
  } catch { /* ignore */ }

  // Synchronous YAML lookup via createRequire (works in both ESM Bun & Node).
  try {
    const { createRequire } = require('module') as typeof import('module');
    const req = createRequire(import.meta.url);
    const yaml = req('yaml') as { parse: (s: string) => unknown } | undefined;
    if (yaml) return (yaml.parse(content) as QAConfig) ?? {};
  } catch { /* ignore */ }

  return parseYamlSimple(content);
}

function parseYamlSimple(content: string): QAConfig {
  // Minimal YAML parser — supports:
  //   - top-level objects
  //   - nested objects (indentation-based)
  //   - dash-prefixed lists (single-line `key: [a, b]` and block lists)
  //   - quoted/unquoted scalars, ints, floats, booleans, null
  //
  // It does NOT support: block scalars (`|`/`>`), anchors/aliases, tags,
  // multi-document streams. Those are unlikely to appear in a QA-Agent
  // config in the wild.

  const root: Record<string, unknown> = {};
  const lines = content.split('\n');

  type Frame = { indent: number; container: Record<string, unknown> | unknown[]; isList: boolean; key?: string };
  const stack: Frame[] = [{ indent: -1, container: root, isList: false }];
  const indentOf = (s: string): number => s.search(/\S/);

  for (const raw of lines) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const indent = indentOf(raw);
    const text = raw.trim();

    // Pop until we find a parent with smaller indent.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (text.startsWith('- ') || text === '-') {
      // Convert the parent.container to a list if it isn't already
      if (!parent.isList) {
        // The container might be the value of a key on the grandparent;
        // we move the existing object out of the way.
        const list: unknown[] = [];
        if (parent.key && stack.length >= 2) {
          const gp = stack[stack.length - 2].container as Record<string, unknown>;
          gp[parent.key] = list;
        } else {
          // top-level list - currently not supported by our schema, ignore
        }
        parent.container = list;
        parent.isList = true;
      }
      const value = text === '-' ? null : parseYamlScalar(text.slice(2).trim());
      (parent.container as unknown[]).push(value);
      continue;
    }

    const colonIdx = text.indexOf(':');
    if (colonIdx < 0) continue;
    const key = text.slice(0, colonIdx).trim();
    const rest = text.slice(colonIdx + 1).trim();

    if (parent.isList) {
      // Rare: key appearing as a sibling of a list item. Just skip.
      continue;
    }

    if (rest === '') {
      // New nested object
      const child: Record<string, unknown> = {};
      (parent.container as Record<string, unknown>)[key] = child;
      stack.push({ indent, container: child, isList: false, key });
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      // Inline list: [a, b, c]
      const inner = rest.slice(1, -1).trim();
      const items = inner === '' ? [] : inner.split(',').map(s => parseYamlScalar(s.trim()));
      (parent.container as Record<string, unknown>)[key] = items;
    } else {
      (parent.container as Record<string, unknown>)[key] = parseYamlScalar(rest);
    }
  }

  return root as unknown as QAConfig;
}

function parseYamlScalar(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

function parseYamlValue(value: string): unknown {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Number
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  
  // Array
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(s => s.trim());
  }
  
  return value;
}

/**
 * Parse JS/TS config file
 */
async function parseJsConfig(filePath: string): Promise<QAConfig> {
  try {
    // Use Bun's require for TS files
    const config = require(filePath);
    return { version: 1, ...(config?.default || config || {}) };
  } catch {
    return { version: 1 };
  }
}

/**
 * Merge user config with defaults
 */
function mergeConfig(defaults: QAConfig, user: QAConfig): QAConfig {
  const merged: QAConfig = {
    version: user.version ?? defaults.version,
    project: {
      ...defaults.project,
      ...user.project,
    },
    skills: {
      ...defaults.skills,
      ...user.skills,
      config: {
        ...(defaults.skills?.config || {}),
        ...(user.skills?.config || {}),
      },
    },
    model: {
      ...defaults.model,
      ...user.model,
    },
    output: {
      ...defaults.output,
      ...user.output,
    },
    ignore: [
      ...(defaults.ignore || []),
      ...(user.ignore || []),
    ],
    thresholds: {
      ...defaults.thresholds,
      ...user.thresholds,
    },
    rules: {
      ...defaults.rules,
      ...user.rules,
    },
  };
  
  return merged;
}

/**
 * Check if a file should be ignored
 * @deprecated Use shouldIgnore from '../utils/ignore' instead
 */
export function shouldIgnore(filePath: string, config?: QAConfig): boolean {
  const patterns = config?.ignore || [];
  return matchesAnyPattern(filePath, patterns);
}

/**
 * Check if a rule is enabled
 */
export function isRuleEnabled(ruleId: string, config: QAConfig, skillName?: string): boolean {
  // Check skill-level config
  if (skillName && config.skills?.config?.[skillName]?.rules?.[ruleId]) {
    return config.skills.config[skillName].rules[ruleId].enabled !== false;
  }
  
  // Check global rules config
  if (config.rules?.[ruleId]) {
    return config.rules[ruleId].enabled !== false;
  }
  
  return true;
}

/**
 * Get rule severity override
 */
export function getRuleSeverity(
  ruleId: string, 
  config: QAConfig, 
  defaultSeverity: 'critical' | 'warning' | 'info',
  skillName?: string
): 'critical' | 'warning' | 'info' {
  // Check skill-level config
  if (skillName && config.skills?.config?.[skillName]?.rules?.[ruleId]?.severity) {
    return config.skills.config[skillName].rules[ruleId].severity as 'critical' | 'warning' | 'info';
  }
  
  // Check global rules config
  if (config.rules?.[ruleId]?.severity) {
    return config.rules[ruleId].severity as 'critical' | 'warning' | 'info';
  }
  
  return defaultSeverity;
}

/**
 * Create default config file
 */
export async function createDefaultConfig(projectPath: string, format: 'yaml' | 'json' | 'ts' = 'json'): Promise<string> {
  const configDir = path.join(projectPath, '.qa-agent');
  await fs.mkdir(configDir, { recursive: true });
  
  let filePath: string;
  let content: string;
  
  switch (format) {
    case 'yaml':
      filePath = path.join(configDir, 'config.yaml');
      content = `# QA-Agent Configuration
# https://github.com/your-org/qa-agent

version: 1

# Project settings
project:
  name: my-project
  type: webapp
  framework: react

# Skill settings
skills:
  enabled:
    - a11y
    - e2e
    - performance
    - security
    - ui-ux

# Model settings
model:
  provider: deepseek
  model: deepseek-chat

# Output settings
output:
  format: compact
  path: .qa-agent/reports

# Ignore patterns
ignore:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - "**/*.min.js"
  - "**/*.d.ts"
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"

# Quality thresholds
thresholds:
  score:
    warning: 70
    error: 50
`;
      break;
      
    case 'json':
    default:
      filePath = path.join(configDir, 'config.json');
      content = JSON.stringify(DEFAULT_CONFIG, null, 2);
      break;
      
    case 'ts':
      filePath = path.join(projectPath, 'qa.config.ts');
      content = `import { defineConfig } from 'qa-agent';

export default defineConfig({
  project: {
    name: 'my-project',
    type: 'webapp',
    framework: 'react',
  },
  
  skills: {
    enabled: ['a11y', 'e2e', 'performance', 'security', 'ui-ux'],
  },
  
  output: {
    format: 'compact',
  },
  
  ignore: [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
  ],
});
`;
      break;
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export { DEFAULT_CONFIG };
