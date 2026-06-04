/**
 * Configuration System
 * Supports .qa-agent/config.yaml, .qa-agent/config.json, qa.config.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

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
  const configPath = findConfigFile(projectPath);
  
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
function findConfigFile(projectPath: string): string | null {
  for (const file of CONFIG_FILES) {
    const fullPath = path.join(projectPath, file);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Parse config file based on extension
 */
export async function parseConfigFile(filePath: string): Promise<QAConfig> {
  const ext = path.extname(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

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
 * Parse YAML config using the battle-tested `js-yaml` library.
 * 覆盖：嵌套 map、数组、多行字符串、锚点、注释里带 `:`、数字/布尔/null/Date 等所有常见情况。
 */
function parseYaml(content: string): QAConfig {
  try {
    const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    if (loaded === null || loaded === undefined) {
      return { version: 1 };
    }
    if (typeof loaded !== 'object' || Array.isArray(loaded)) {
      throw new Error('YAML config must be a mapping at the root');
    }
    return { version: 1, ...(loaded as Partial<QAConfig>) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML config: ${msg}`);
  }
}

/**
 * Parse JS/TS config file via dynamic import.
 * .ts 文件需要 bun/tsx 之类的运行时；纯 .js 文件在 ESM 项目下也能 import。
 */
async function parseJsConfig(filePath: string): Promise<QAConfig> {
  try {
    const fileUrl = pathToFileUrl(filePath);
    const mod = await import(fileUrl);
    const config = mod.default ?? mod;
    if (!config || typeof config !== 'object') {
      return { version: 1 };
    }
    return { version: 1, ...config };
  } catch {
    return { version: 1 };
  }
}

function pathToFileUrl(p: string): string {
  // Node 也有 url.pathToFileURL，跨平台拼一份避免依赖运行时
  const normalized = p.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
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
 */
export function shouldIgnore(filePath: string, config?: QAConfig): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  const ignorePatterns = config?.ignore || [];
  
  for (const pattern of ignorePatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    
    // Handle different glob patterns
    if (normalizedPattern === '**/*') {
      return true;
    }
    
    // Pattern like **/*.ext - match any file with extension
    if (normalizedPattern.startsWith('**/*.')) {
      const ext = normalizedPattern.slice(4); // Remove '**/*'
      if (normalizedPath.endsWith(ext)) return true;
      continue;
    }
    
    // Pattern like dir/** - match anything under directory
    if (normalizedPattern.endsWith('/**')) {
      const prefix = normalizedPattern.slice(0, -3);
      if (normalizedPath.startsWith(prefix + '/') || normalizedPath === prefix) return true;
      continue;
    }
    
    // Pattern like **/name/** - match directory anywhere
    if (normalizedPattern.startsWith('**/') && normalizedPattern.endsWith('/**')) {
      const dirName = normalizedPattern.slice(3, -3); // Remove '**/' and '/**'
      if (normalizedPath.includes('/' + dirName + '/')) return true;
      continue;
    }
    
    // Pattern like **/name - match name anywhere
    if (normalizedPattern.startsWith('**/')) {
      const name = normalizedPattern.slice(3);
      // Check if path ends with /name or is exactly name
      if (normalizedPath.endsWith('/' + name) || normalizedPath === name) return true;
      continue;
    }
    
    // Pattern with wildcards - convert to regex
    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/\*\*/g, '<<DOUBLESTAR>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<DOUBLESTAR>>/g, '.*')
        .replace(/\?/g, '[^/]');
      
      const regex = new RegExp('^' + regexPattern + '$');
      if (regex.test(normalizedPath)) return true;
      continue;
    }
    
    // Exact match
    if (normalizedPath === normalizedPattern) return true;
  }
  
  return false;
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
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
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
  
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export { DEFAULT_CONFIG };
