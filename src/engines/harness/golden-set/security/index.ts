/**
 * Security Golden Set — 10 个安全基准测试用例
 */

import type { GoldenTestCase } from '../../types';

export const securityGoldenCases: GoldenTestCase[] = [
  // ---------------------------------------------------------------------------
  // Case 1: 硬编码 API 密钥（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-hardcoded-key-001',
    skill: 'security',
    input: {
      code: `const API_KEY = 'sk-1234567890abcdef';
const apiClient = axios.create({
  baseURL: 'https://api.example.com',
  headers: { Authorization: \`Bearer \${API_KEY}\` },
});

export default apiClient;`,
      filePath: 'src/api/client.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['hardcoded-secret'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'process.env.',
      shouldNotExist: ["'sk-1234567890abcdef'"],
    },
    difficulty: 'easy',
    tags: ['secrets', 'credentials'],
  },

  // ---------------------------------------------------------------------------
  // Case 2: eval() 使用（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-eval-002',
    skill: 'security',
    input: {
      code: `function processConfig(configString: string) {
  const config = eval('(' + configString + ')');
  return config;
}

export { processConfig };`,
      filePath: 'src/utils/config.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['eval-usage'],
      falsePositives: ['hardcoded-secret'],
    },
    expectedFix: {
      codePattern: 'JSON.parse',
      shouldNotExist: ['eval('],
    },
    difficulty: 'easy',
    tags: ['code-injection', 'eval'],
  },

  // ---------------------------------------------------------------------------
  // Case 3: innerHTML XSS（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-innerhtml-003',
    skill: 'security',
    input: {
      code: `function renderComment(comment: string) {
  const container = document.getElementById('comments');
  if (container) {
    container.innerHTML = '<div class="comment">' + comment + '</div>';
  }
}

export { renderComment };`,
      filePath: 'src/dom/render.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['xss-risk'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'textContent',
      shouldNotExist: ['innerHTML ='],
    },
    difficulty: 'easy',
    tags: ['xss', 'dom'],
  },

  // ---------------------------------------------------------------------------
  // Case 4: SQL 注入（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-sql-injection-004',
    skill: 'security',
    input: {
      code: `async function getUserById(userId: string) {
  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
  return await db.query(query);
}

async function searchUsers(term: string) {
  const sql = \`SELECT * FROM users WHERE name LIKE '%\${term}%'\`;
  return await db.query(sql);
}

export { getUserById, searchUsers };`,
      filePath: 'src/db/users.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['sql-injection'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'param',
      shouldNotExist: ["+ userId +", "$\\{term}"],
    },
    difficulty: 'easy',
    tags: ['sql-injection', 'database'],
  },

  // ---------------------------------------------------------------------------
  // Case 5: Math.random() 用于安全敏感场景（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-insecure-random-005',
    skill: 'security',
    input: {
      code: `function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export { generateToken };`,
      filePath: 'src/auth/token.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['insecure-random'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'crypto',
      shouldNotExist: ['Math.random()'],
    },
    difficulty: 'medium',
    tags: ['cryptography', 'token'],
  },

  // ---------------------------------------------------------------------------
  // Case 6: 硬编码密码 + HTTP URL（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-mixed-secrets-006',
    skill: 'security',
    input: {
      code: `const DB_PASSWORD = 'SuperSecret123!';
const API_URL = 'http://api.internal.example.com/v1';

const dbConfig = {
  host: 'db.example.com',
  user: 'admin',
  password: DB_PASSWORD,
};

export { dbConfig, API_URL };`,
      filePath: 'src/config/database.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['hardcoded-secret', 'http-url'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'process.env.',
      shouldNotExist: ["'SuperSecret123!'", "'http://"],
    },
    difficulty: 'medium',
    tags: ['secrets', 'https', 'database'],
  },

  // ---------------------------------------------------------------------------
  // Case 7: dangerouslySetInnerHTML React XSS（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-react-xss-007',
    skill: 'security',
    input: {
      code: `import React from 'react';

function SafeHtml({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

function UserProfile({ bio }: { bio: string }) {
  return (
    <article>
      <h2>User Profile</h2>
      <div dangerouslySetInnerHTML={{ __html: bio }} />
    </article>
  );
}

export { SafeHtml, UserProfile };`,
      filePath: 'src/components/SafeHtml.tsx',
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['xss-risk'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'DOMPurify',
      shouldNotExist: ['dangerouslySetInnerHTML'],
    },
    difficulty: 'medium',
    tags: ['xss', 'react', 'jsx'],
  },

  // ---------------------------------------------------------------------------
  // Case 8: CORS 宽松配置（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-cors-008',
    skill: 'security',
    input: {
      code: `import cors from 'cors';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));

export default app;`,
      filePath: 'src/server/index.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['cors-misconfig'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'origin:',
      shouldNotExist: ["origin: '*'"],
    },
    difficulty: 'medium',
    tags: ['cors', 'express'],
  },

  // ---------------------------------------------------------------------------
  // Case 9: 禁用安全中间件（困难）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-disabled-security-009',
    skill: 'security',
    input: {
      code: `import helmet from 'helmet';
import express from 'express';

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  xssFilter: false,
  noSniff: false,
  frameguard: false,
}));

export default app;`,
      filePath: 'src/server/app.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['disabled-security'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'contentSecurityPolicy: true',
      shouldNotExist: ['contentSecurityPolicy: false'],
    },
    difficulty: 'hard',
    tags: ['helmet', 'csp', 'express'],
  },

  // ---------------------------------------------------------------------------
  // Case 10: 多漏洞混合 — SQL注入 + XSS + 硬编码密钥（困难）
  // ---------------------------------------------------------------------------
  {
    id: 'sec-multi-vuln-010',
    skill: 'security',
    input: {
      code: `const SECRET = 'my-secret-key-12345';
const API_URL = 'http://api.example.com';

async function getUser(username: string) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  const result = await db.query(query);
  
  const html = '<div class="user">' + result.name + '</div>';
  document.getElementById('profile').innerHTML = html;
  
  return result;
}

function renderUser(user: any) {
  return '<h1>' + user.name + '</h1><p>' + user.email + '</p>';
}

export { getUser, renderUser };`,
      filePath: 'src/users/handler.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 4,
      issueTypes: ['hardcoded-secret', 'http-url', 'sql-injection', 'xss-risk'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'process.env.',
      shouldNotExist: ["'my-secret-key-12345'", "http://", "innerHTML =", "+ username"],
    },
    difficulty: 'hard',
    tags: ['multi-vulnerability', 'sql-injection', 'xss', 'secrets'],
  },
];

export default securityGoldenCases;
