/**
 * API Skill
 * Tests API endpoints and validates responses
 */

import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Severity,
  DiagnosisType,
} from '../../../types';
import { generateId } from '../../../utils';

// Files to exclude from API analysis
const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.test\./,
  /\.spec\./,
  /__tests__/,
  /__mocks__/,
  /\.d\.ts$/,
  /skills\/builtin\/api\//,
];

// Directories to exclude
const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'tests',
  '__tests__',
];

// API endpoint patterns to detect
const API_PATTERNS = [
  /(?:app\.(?:get|post|put|delete|patch)|router\.(?:get|post|put|delete|patch))\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /(?:router|app)\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /fastify\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /app\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
  /export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)/gi,
];

// API test rules
const API_RULES = [
  {
    id: 'hardcoded-api-key',
    patterns: [
      /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{10,}['"]/gi,
    ],
    severity: 'critical' as Severity,
    title: 'Hardcoded API Key',
    description: 'API Key should not be hardcoded in source code',
    suggestion: 'Use environment variables to store API Key',
  },
  {
    id: 'missing-rate-limit',
    check: (content: string, file: string) => {
      if (file.includes('.test.') || file.includes('.spec.')) return false;
      const hasApiRoutes = /(?:app|router)\.(?:get|post|put|delete|patch)/.test(content);
      const hasRateLimit = /rateLimit|rate.?limit|throttle/i.test(content);
      return hasApiRoutes && !hasRateLimit;
    },
    severity: 'warning' as Severity,
    title: 'Missing Rate Limit',
    description: 'API does not implement rate limiting',
    suggestion: 'Add rate limiting middleware',
  },
  {
    id: 'missing-cors',
    check: (content: string, file: string) => {
      if (file.includes('.test.') || file.includes('.spec.')) return false;
      const hasApiRoutes = /(?:app|router)\.(?:get|post|put|delete|patch)/.test(content);
      const hasCors = /cors|Access-Control-Allow/i.test(content);
      return hasApiRoutes && !hasCors;
    },
    severity: 'info' as Severity,
    title: 'Missing CORS Configuration',
    description: 'API does not configure CORS',
    suggestion: 'Add CORS middleware',
  },
  {
    id: 'sync-operation',
    patterns: [
      /(?:readFileSync|writeFileSync|existsSync|readdirSync|statSync)/g,
    ],
    severity: 'warning' as Severity,
    title: 'Synchronous Operation',
    description: 'Using synchronous operations in API may affect performance',
    suggestion: 'Use asynchronous versions',
  },
  {
    id: 'missing-response-type',
    patterns: [
      /res\.(?:send|json)\s*\([^)]*\)/g,
    ],
    severity: 'info' as Severity,
    title: 'Missing Response Type',
    description: 'API response does not set Content-Type',
    suggestion: 'Set proper Content-Type header',
  },
];

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface ApiTestResult {
  endpoint: ApiEndpoint;
  status: number;
  responseTime: number;
  success: boolean;
  error?: string;
}

export class APISkill extends BaseSkill {
  name = 'api';
  version = '1.0.0';
  description = 'API endpoint testing and validation';

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project } = context;

    // Scan for API endpoints
    const endpoints = await this.scanEndpoints(project.rootPath);

    // Check each endpoint
    for (const endpoint of endpoints) {
      const endpointIssues = await this.checkEndpoint(endpoint, context);
      issues.push(...endpointIssues);
    }

    // Check API rules
    const ruleIssues = await this.checkRules(project.rootPath);
    issues.push(...ruleIssues);

    return issues;
  }

  private async scanEndpoints(projectPath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    // Implementation would scan files for API patterns
    return endpoints;
  }

  private async checkEndpoint(
    endpoint: ApiEndpoint,
    context: SkillContext
  ): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    // Implementation would test the endpoint
    return issues;
  }

  private async checkRules(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    // Implementation would check API rules
    return issues;
  }

  async fix(diagnosis: Diagnosis, context: SkillContext): Promise<Fix> {
    // Implementation would fix API issues
    throw new Error(`Auto-fix not implemented for API skill`);
  }
}

export default APISkill;
