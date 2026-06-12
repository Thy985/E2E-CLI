/**
 * API Skill
 * Tests API endpoints and validates responses
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseSkill } from '../../base-skill';
import {
  SkillContext,
  Diagnosis,
  Fix,
  Location,
} from '../../../types';
import { generateId } from '../../../utils';

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

// Patterns for detecting API route definitions in source code
const ROUTE_PATTERNS: {
  id: string;
  regex: RegExp;
  framework: string;
}[] = [
  {
    id: 'express-get',
    regex: /\b(?:app|router)\s*\.\s*get\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Express',
  },
  {
    id: 'express-post',
    regex: /\b(?:app|router)\s*\.\s*post\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Express',
  },
  {
    id: 'express-put',
    regex: /\b(?:app|router)\s*\.\s*put\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Express',
  },
  {
    id: 'express-patch',
    regex: /\b(?:app|router)\s*\.\s*patch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Express',
  },
  {
    id: 'express-delete',
    regex: /\b(?:app|router)\s*\.\s*delete\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Express',
  },
  {
    id: 'fastify-get',
    regex: /\b(?:fastify|server)\s*\.\s*get\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Fastify',
  },
  {
    id: 'fastify-post',
    regex: /\b(?:fastify|server)\s*\.\s*post\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Fastify',
  },
  {
    id: 'fastify-put',
    regex: /\b(?:fastify|server)\s*\.\s*put\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Fastify',
  },
  {
    id: 'fastify-patch',
    regex: /\b(?:fastify|server)\s*\.\s*patch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Fastify',
  },
  {
    id: 'fastify-delete',
    regex: /\b(?:fastify|server)\s*\.\s*delete\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Fastify',
  },
  {
    id: 'koa-get',
    regex: /\b(?:router)\s*\.\s*get\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Koa',
  },
  {
    id: 'koa-post',
    regex: /\b(?:router)\s*\.\s*post\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Koa',
  },
  {
    id: 'koa-put',
    regex: /\b(?:router)\s*\.\s*put\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Koa',
  },
  {
    id: 'koa-patch',
    regex: /\b(?:router)\s*\.\s*patch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Koa',
  },
  {
    id: 'koa-delete',
    regex: /\b(?:router)\s*\.\s*delete\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    framework: 'Koa',
  },
];

// File patterns that indicate test, mock, or example code
const FALSE_POSITIVE_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /__tests__\//,
  /__mocks__\//,
  /\.mock\.(ts|tsx|js|jsx)$/,
  /\/mocks?\//,
  /\.stories\.(ts|tsx|js|jsx)$/,
  /\/examples?\//,
  /\/demo\//,
  /\.d\.ts$/,
  /fixture/i,
];

export class APISkill extends BaseSkill {
  name = 'api';
  version = '1.0.0';
  description = 'API endpoint testing and validation';

  triggers = [
    { type: 'command' as const, pattern: 'api', priority: 100 },
    { type: 'keyword' as const, pattern: /api|endpoint|rest|graphql/i, priority: 80 },
    { type: 'file' as const, pattern: /\.(ts|js|tsx|jsx)$/i, priority: 60 },
  ];

  capabilities = [
    {
      name: 'api-testing',
      description: 'Test API endpoints',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
    {
      name: 'api-validation',
      description: 'Validate API responses',
      autoFixable: false,
      riskLevel: 'low' as const,
    },
  ];

  async diagnose(context: SkillContext): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project } = context;

    // Scan for API endpoints
    const endpoints = await this.scanEndpoints(project.path);

    // Check each endpoint
    for (const endpoint of endpoints) {
      const endpointIssues = await this.checkEndpoint(endpoint, context);
      issues.push(...endpointIssues);
    }

    // Check API rules
    const ruleIssues = await this.checkRules(project.path);
    issues.push(...ruleIssues);

    return issues;
  }

  private async scanEndpoints(projectPath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    const sourceFiles = await this.getSourceFiles(projectPath);

    // 1. Scan source files for route patterns (Express, Fastify, Koa)
    for (const file of sourceFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);
      const fileEndpoints = this.scanFileForRoutes(content, relativePath);
      endpoints.push(...fileEndpoints);
    }

    // 2. Detect Next.js API routes by file structure
    const nextApiFiles = await this.findNextJsApiRoutes(projectPath);
    endpoints.push(...nextApiFiles);

    return endpoints;
  }

  private scanFileForRoutes(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const lines = content.split('\n');

    for (const routePattern of ROUTE_PATTERNS) {
      // Reset regex lastIndex
      routePattern.regex.lastIndex = 0;

      for (const line of lines) {
        const match = routePattern.regex.exec(line);
        if (match) {
          const method = routePattern.id.split('-').pop()!.toUpperCase();
          const routePath = match[1];
          const lineNumber = this.getLineNumber(content, content.indexOf(line));

          endpoints.push({
            method,
            path: routePath,
            file: filePath,
            line: lineNumber,
          });
        }
      }
    }

    return endpoints;
  }

  private async findNextJsApiRoutes(projectPath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    const apiDirs = ['pages/api', 'app/api', 'src/pages/api', 'src/app/api'];

    for (const apiDir of apiDirs) {
      const fullDir = path.join(projectPath, apiDir);
      if (!fs.existsSync(fullDir)) continue;

      const files = await this.walkDir(fullDir);
      for (const file of files) {
        if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
        if (FALSE_POSITIVE_FILE_PATTERNS.some((p) => p.test(file))) continue;

        const relativePath = path.relative(projectPath, file);
        const method = this.getNextJsMethod(file, relativePath);
        const routePath = this.getNextJsRoute(file, apiDir);

        endpoints.push({
          method,
          path: routePath,
          file: relativePath,
          line: 1,
        });
      }
    }

    return endpoints;
  }

  private getNextJsMethod(_file: string, relativePath: string): string {

    // Handle Next.js route handlers (app dir) - check for method in file content
    if (relativePath.includes('app/api/')) {
      return 'ANY'; // App router handles methods within the handler
    }

    // Pages API: infer from HTTP method exports (GET, POST, etc.)
    // Default to 'ANY' since pages/api files handle multiple methods
    return 'ANY';
  }

  private getNextJsRoute(file: string, apiDir: string): string {
    const relativeToApi = file.replace(apiDir + '/', '').replace(path.extname(file), '');
    let routePath = '/' + relativeToApi.replace(/\\/g, '/');

    // Handle Next.js dynamic routes: [id] -> :id
    routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');

    // Handle Next.js catch-all routes: [...slug] -> *
    routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, '*');

    // Handle index files
    routePath = routePath.replace(/\/index$/, '') || '/';

    return routePath;
  }

  private async getSourceFiles(projectPath: string): Promise<string[]> {
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const found = await this.globFiles(projectPath, pattern);
      files.push(...found);
    }

    return [...new Set(files)].filter((f) => {
      const normalized = f.replace(/\\/g, '/');
      if (normalized.includes('node_modules')) return false;
      if (normalized.includes('.d.ts')) return false;
      if (FALSE_POSITIVE_FILE_PATTERNS.some((p) => p.test(normalized))) return false;
      return true;
    });
  }

  private async globFiles(dir: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    const ext = pattern.replace('**/', '').replace('*', '');

    const scanDir = (currentDir: string, depth: number = 0) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.endsWith(ext)) {
            files.push(fullPath);
          }
        }
      } catch {
        // ignore permission errors
      }
    };

    scanDir(dir);
    return files;
  }

  private async walkDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    const scanDir = (currentDir: string, depth: number = 0) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch {
        // ignore permission errors
      }
    };
    scanDir(dir);
    return files;
  }

  private async checkEndpoint(
    endpoint: ApiEndpoint,
    context: SkillContext
  ): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const { project } = context;
    const filePath = path.join(project.path, endpoint.file);

    let content: string;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return issues;
    }

    const lines = content.split('\n');

    // Check for missing error handling (try/catch)
    const errorHandlingIssues = this.checkErrorHandling(endpoint, content, lines);
    issues.push(...errorHandlingIssues);

    // Check for missing input validation
    const validationIssues = this.checkInputValidation(endpoint, content, lines);
    issues.push(...validationIssues);

    // Check for missing authentication/authorization
    const authIssues = this.checkAuthentication(endpoint, content, lines);
    issues.push(...authIssues);

    // Check for proper HTTP status codes
    const statusIssues = this.checkStatusCodes(endpoint, content, lines);
    issues.push(...statusIssues);

    return issues;
  }

  private checkErrorHandling(
    endpoint: ApiEndpoint,
    _content: string,
    lines: string[]
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // Get the handler function body (approximate: from route definition to next route or end)
    const handlerStart = endpoint.line - 1;
    let handlerEnd = lines.length;

    // Find the end of the handler (next route definition or closing brace at same level)
    for (let i = handlerStart + 1; i < lines.length; i++) {
      if (/\b(?:app|router|fastify)\s*\.\s*(?:get|post|put|patch|delete)\s*\(/i.test(lines[i])) {
        handlerEnd = i;
        break;
      }
    }

    const handlerBody = lines.slice(handlerStart, Math.min(handlerEnd, handlerStart + 50)).join('\n');

    // Check for try/catch in the handler
    if (!/try\s*\{/.test(handlerBody) && !/catch\s*\(/.test(handlerBody)) {
      // Also check for .catch() promise handling
      if (!/\.catch\s*\(/.test(handlerBody)) {
        issues.push({
          id: `api-error-${generateId()}`,
          skill: this.name,
          type: 'api',
          severity: 'warning',
          title: 'Missing error handling in route handler',
          description: `Route ${endpoint.method} ${endpoint.path} does not have try/catch or .catch() error handling. Unhandled errors will cause uncaught exceptions.`,
          location: {
            file: endpoint.file,
            line: endpoint.line,
          },
          metadata: {
            category: 'api',
            type: 'missing-error-handling',
            endpoint,
            suggestion: 'Wrap the handler body in try/catch or add .catch() to promise chains',
          },
          fixSuggestion: {
            description: 'Add try/catch block to handle errors gracefully',
            code: `try {\n  // handler logic\n} catch (error) {\n  res.status(500).json({ error: 'Internal server error' });\n}`,
            autoApplicable: false,
            riskLevel: 'low',
          },
        });
      }
    }

    return issues;
  }

  private checkInputValidation(
    endpoint: ApiEndpoint,
    _content: string,
    lines: string[]
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // Only check methods that typically receive body data
    if (!['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      return issues;
    }

    const handlerStart = endpoint.line - 1;
    const handlerSnippet = lines
      .slice(handlerStart, Math.min(handlerStart + 30, lines.length))
      .join('\n');

    // Check for common validation patterns
    const hasValidation =
      // Joi / Zod / Yup validation
      /\.validate\(/i.test(handlerSnippet) ||
      /\.parse\(/i.test(handlerSnippet) ||
      // Express-validator
      /check\(/i.test(handlerSnippet) ||
      /body\(/i.test(handlerSnippet) ||
      // Joi schema
      /Joi\./i.test(handlerSnippet) ||
      // Zod schema
      /z\.\w+\(/i.test(handlerSnippet) ||
      // Yup schema
      /yup\./i.test(handlerSnippet) ||
      // Manual validation
      /if\s*\(\s*!.*req\.body/i.test(handlerSnippet) ||
      /throw.*invalid/i.test(handlerSnippet) ||
      /400/i.test(handlerSnippet);

    if (!hasValidation) {
      issues.push({
        id: `api-validation-${generateId()}`,
        skill: this.name,
        type: 'api',
        severity: 'warning',
        title: 'Missing input validation',
        description: `Route ${endpoint.method} ${endpoint.path} does not appear to validate request input. Unvalidated input can lead to security vulnerabilities and data integrity issues.`,
        location: {
          file: endpoint.file,
          line: endpoint.line,
        },
        metadata: {
          category: 'api',
          type: 'missing-validation',
          endpoint,
          suggestion: 'Add input validation using Joi, Zod, Yup, or express-validator',
        },
        fixSuggestion: {
          description: 'Add input validation middleware or inline validation',
          code: `const schema = z.object({ /* define schema */ });\nconst data = schema.parse(req.body);`,
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    return issues;
  }

  private checkAuthentication(
    endpoint: ApiEndpoint,
    _content: string,
    lines: string[]
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];

    // Skip public endpoints (login, register, health, etc.)
    const publicPaths = [
      '/login', '/auth/login', '/register', '/signup', '/health',
      '/healthz', '/ready', '/ping', '/favicon.ico', '/robots.txt',
      '/public', '/docs', '/swagger', '/api-docs', '/graphql',
    ];
    const isPublic = publicPaths.some((p) =>
      endpoint.path.toLowerCase().startsWith(p.toLowerCase())
    );
    if (isPublic) return issues;

    const handlerStart = endpoint.line - 1;
    const handlerSnippet = lines
      .slice(handlerStart, Math.min(handlerStart + 30, lines.length))
      .join('\n');

    // Check for auth patterns
    const hasAuth =
      /auth/i.test(handlerSnippet) ||
      /jwt/i.test(handlerSnippet) ||
      /token/i.test(handlerSnippet) ||
      /session/i.test(handlerSnippet) ||
      /bearer/i.test(handlerSnippet) ||
      /requireAuth/i.test(handlerSnippet) ||
      /isAuthenticated/i.test(handlerSnippet) ||
      /middleware.*auth/i.test(handlerSnippet) ||
      /passport/i.test(handlerSnippet) ||
      /authorize/i.test(handlerSnippet) ||
      /checkCredentials/i.test(handlerSnippet) ||
      // Check for auth middleware in route definition
      /authenticate|authorize|requireAuth|isLoggedIn|isAuth/gi.test(
        lines[handlerStart] || ''
      );

    if (!hasAuth) {
      issues.push({
        id: `api-auth-${generateId()}`,
        skill: this.name,
        type: 'api',
        severity: 'warning',
        title: 'Missing authentication/authorization',
        description: `Route ${endpoint.method} ${endpoint.path} does not appear to have authentication or authorization checks. Protected routes should verify user identity and permissions.`,
        location: {
          file: endpoint.file,
          line: endpoint.line,
        },
        metadata: {
          category: 'api',
          type: 'missing-authentication',
          endpoint,
          suggestion: 'Add authentication middleware (JWT, session, OAuth) and authorization checks',
        },
        fixSuggestion: {
          description: 'Add authentication middleware to protect this route',
          code: `router.get('${endpoint.path}', authenticateToken, handler);`,
          autoApplicable: false,
          riskLevel: 'medium',
        },
      });
    }

    return issues;
  }

  private checkStatusCodes(
    endpoint: ApiEndpoint,
    _content: string,
    lines: string[]
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];

    const handlerStart = endpoint.line - 1;
    const handlerSnippet = lines
      .slice(handlerStart, Math.min(handlerStart + 30, lines.length))
      .join('\n');

    // Check for error responses returning 200
    // Pattern: status(200) with error message, or json({...error...}) without status change
    const has200Error =
      /\.status\s*\(\s*200\s*\)\s*\..*error/i.test(handlerSnippet) ||
      /\.send\s*\(\s*\{\s*success\s*:\s*false/i.test(handlerSnippet) ||
      (/status\s*:\s*200/i.test(handlerSnippet) && /error/i.test(handlerSnippet));

    if (has200Error) {
      issues.push({
        id: `api-status-${generateId()}`,
        skill: this.name,
        type: 'api',
        severity: 'info',
        title: 'Error response with 200 status code',
        description: `Route ${endpoint.method} ${endpoint.path} appears to return HTTP 200 for error responses. Use appropriate HTTP status codes (4xx for client errors, 5xx for server errors).`,
        location: {
          file: endpoint.file,
          line: endpoint.line,
        },
        metadata: {
          category: 'api',
          type: 'improper-status-code',
          endpoint,
          suggestion: 'Use 400 for client errors, 500 for server errors instead of 200',
        },
        fixSuggestion: {
          description: 'Change error response status code to appropriate HTTP status',
          code: `res.status(400).json({ error: 'Bad request' });`,
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    return issues;
  }

  private async checkRules(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const endpoints = await this.scanEndpoints(projectPath);

    // Check for consistent naming conventions
    const namingIssues = this.checkNamingConventions(endpoints, projectPath);
    issues.push(...namingIssues);

    // Check for versioned APIs
    const versionIssues = this.checkApiVersioning(endpoints, projectPath);
    issues.push(...versionIssues);

    // Check for proper content-type headers
    const contentTypeIssues = await this.checkContentTypeHeaders(endpoints, projectPath);
    issues.push(...contentTypeIssues);

    // Check for CORS configuration
    const corsIssues = await this.checkCorsConfiguration(projectPath);
    issues.push(...corsIssues);

    return issues;
  }

  private checkNamingConventions(
    endpoints: ApiEndpoint[],
    _projectPath: string
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];

    for (const endpoint of endpoints) {
      const routePath = endpoint.path;

      // Check for trailing slashes (except root)
      if (routePath !== '/' && routePath.endsWith('/')) {
        issues.push({
          id: `api-naming-${generateId()}`,
          skill: this.name,
          type: 'api',
          severity: 'info',
          title: 'Trailing slash in route path',
          description: `Route ${endpoint.method} ${routePath} has a trailing slash. Consistent URL structure should avoid trailing slashes.`,
          location: {
            file: endpoint.file,
            line: endpoint.line,
          },
          metadata: {
            category: 'api',
            type: 'naming-convention',
            endpoint,
            suggestion: `Use ${routePath.slice(0, -1)} instead of ${routePath}`,
          },
        });
      }

      // Check for camelCase or PascalCase in path segments (prefer kebab-case)
      const pathSegments = routePath.split('/').filter(Boolean);
      for (const segment of pathSegments) {
        // Skip dynamic route parameters (:id, [id], etc.)
        if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) continue;
        if (segment === '*') continue;

        // Check for camelCase (has lowercase followed by uppercase)
        if (/[a-z][A-Z]/.test(segment)) {
          const kebabSegment = segment.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          issues.push({
            id: `api-naming-${generateId()}`,
            skill: this.name,
            type: 'api',
            severity: 'info',
            title: 'Non-kebab-case route segment',
            description: `Route segment '${segment}' in ${routePath} uses camelCase. REST API paths should use kebab-case.`,
            location: {
              file: endpoint.file,
              line: endpoint.line,
            },
            metadata: {
              category: 'api',
              type: 'naming-convention',
              endpoint,
              suggestion: `Use '${kebabSegment}' instead of '${segment}'`,
            },
          });
        }
      }

      // Check for uppercase in non-dynamic segments
      for (const segment of pathSegments) {
        if (segment.startsWith(':') || segment.startsWith('[') || segment.startsWith('{')) continue;
        if (segment === '*') continue;
        if (/[A-Z]/.test(segment) && !/[a-z][A-Z]/.test(segment)) {
          // Has uppercase but not camelCase (e.g., ALLCAPS or PascalCase)
          const kebabSegment = segment.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          if (kebabSegment !== segment.toLowerCase()) {
            issues.push({
              id: `api-naming-${generateId()}`,
              skill: this.name,
              type: 'api',
              severity: 'info',
              title: 'Uppercase characters in route path',
              description: `Route segment '${segment}' contains uppercase characters. URLs should be lowercase.`,
              location: {
                file: endpoint.file,
                line: endpoint.line,
              },
              metadata: {
                category: 'api',
                type: 'naming-convention',
                endpoint,
                suggestion: `Use '${kebabSegment}' instead of '${segment}'`,
              },
            });
          }
        }
      }
    }

    return issues;
  }

  private checkApiVersioning(
    endpoints: ApiEndpoint[],
    _projectPath: string
  ): Diagnosis[] {
    const issues: Diagnosis[] = [];
    const hasVersionedRoutes = endpoints.some((e) => /\/v\d+\//i.test(e.path));

    if (endpoints.length > 0 && !hasVersionedRoutes) {
      // Find a representative endpoint to report against
      const firstEndpoint = endpoints[0];
      issues.push({
        id: `api-version-${generateId()}`,
        skill: this.name,
        type: 'api',
        severity: 'info',
        title: 'API not versioned',
        description: `The project has ${endpoints.length} API endpoints but no versioned routes (e.g., /v1/, /v2/). API versioning helps manage breaking changes and backward compatibility.`,
        location: {
          file: firstEndpoint.file,
          line: firstEndpoint.line,
        },
        metadata: {
          category: 'api',
          type: 'missing-versioning',
          endpointCount: endpoints.length,
          suggestion: 'Use URL versioning: /api/v1/users, /api/v2/users',
        },
      });
    }

    return issues;
  }

  private async checkContentTypeHeaders(
    endpoints: ApiEndpoint[],
    projectPath: string
  ): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];

    // Check POST/PUT/PATCH endpoints for content-type handling
    const mutatingEndpoints = endpoints.filter((e) =>
      ['POST', 'PUT', 'PATCH'].includes(e.method)
    );

    for (const endpoint of mutatingEndpoints) {
      const filePath = path.join(projectPath, endpoint.file);
      let content: string;
      try {
        content = await fs.promises.readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const handlerStart = endpoint.line - 1;
      const handlerSnippet = lines
        .slice(handlerStart, Math.min(handlerStart + 30, lines.length))
        .join('\n');

      // Check if endpoint handles or sets content-type
      const hasContentTypeHandling =
        /content-type/i.test(handlerSnippet) ||
        /application\/json/i.test(handlerSnippet) ||
        /\.json\(/i.test(handlerSnippet) || // Express res.json() implies content-type
        /bodyParser/i.test(handlerSnippet) ||
        /express\.json/i.test(handlerSnippet);

      if (!hasContentTypeHandling) {
        issues.push({
          id: `api-contenttype-${generateId()}`,
          skill: this.name,
          type: 'api',
          severity: 'info',
          title: 'No explicit Content-Type handling',
          description: `Route ${endpoint.method} ${endpoint.path} does not appear to explicitly handle Content-Type headers. Consider setting Content-Type: application/json for API responses.`,
          location: {
            file: endpoint.file,
            line: endpoint.line,
          },
          metadata: {
            category: 'api',
            type: 'content-type',
            endpoint,
            suggestion: 'Set Content-Type: application/json header in responses',
          },
        });
      }
    }

    return issues;
  }

  private async checkCorsConfiguration(projectPath: string): Promise<Diagnosis[]> {
    const issues: Diagnosis[] = [];
    const sourceFiles = await this.getSourceFiles(projectPath);

    let hasWildcardCors = false;
    let corsLocation: Location | undefined;

    for (const file of sourceFiles) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const relativePath = path.relative(projectPath, file);

      // Check for cors() middleware usage
      if (/cors\s*\(/i.test(content)) {
        const match = content.match(/cors\s*\(/);
        if (match) {
          corsLocation = {
            file: relativePath,
            line: this.getLineNumber(content, match.index!),
          };
        }

        // Check for wildcard origin
        if (/origin\s*:\s*['"`]\*['"`]/i.test(content) || /origin\s*:\s*true/i.test(content)) {
          hasWildcardCors = true;
        }
      }

      // Check for manual CORS headers
      if (/Access-Control-Allow-Origin/i.test(content)) {
        if (/['"`]\*['"`]/.test(content)) {
          hasWildcardCors = true;
        }
      }
    }

    if (hasWildcardCors && corsLocation) {
      issues.push({
        id: `api-cors-${generateId()}`,
        skill: this.name,
        type: 'api',
        severity: 'warning',
        title: 'CORS allows all origins (wildcard)',
        description: 'CORS is configured with Access-Control-Allow-Origin: * which allows any origin to access the API. This can be a security risk.',
        location: corsLocation,
        metadata: {
          category: 'api',
          type: 'cors-wildcard',
          suggestion: 'Restrict CORS to specific allowed origins',
        },
        fixSuggestion: {
          description: 'Configure CORS with specific allowed origins',
          code: `app.use(cors({ origin: ['https://example.com'] }));`,
          autoApplicable: false,
          riskLevel: 'low',
        },
      });
    }

    return issues;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  async fix(_diagnosis: Diagnosis, _context: SkillContext): Promise<Fix> {
    // Implementation would fix API issues
    throw new Error(`Auto-fix not implemented for API skill`);
  }
}

export default APISkill;
