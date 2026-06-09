/**
 * Skill Diagnose Integration Tests
 *
 * Tests real skills detecting real issues:
 * - A11y skill detects missing alt, empty buttons, missing lang on real HTML
 * - Security skill detects hardcoded secrets, SQL injection on real source
 * - Dependency skill detects git URLs, wrong placement on real package.json
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A11ySkill } from '../../src/skills/builtin/a11y';
import { SecuritySkill } from '../../src/skills/builtin/security';
import { DependencySkill } from '../../src/skills/builtin/dependency';
import { createTools } from '../../src/tools';
import { createLogger } from '../../src/utils/logger';
import { createStorage } from '../../src/storage';

let tmpDir: string;

function makeContext() {
  return {
    project: { name: 'test-project', path: tmpDir },
    config: { enabled: true, options: {} } as any,
    logger: createLogger({ level: 'error' }),
    tools: createTools(tmpDir),
    model: {
      chat: async () => 'mock',
      embed: async () => Array(1536).fill(0),
    } as any,
    storage: createStorage(),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-skill-diagnose-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A11y Skill – real HTML file detection
// ---------------------------------------------------------------------------

describe('A11ySkill.diagnose – real HTML detection', () => {
  it('should detect missing alt attribute on img tags', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      `<!DOCTYPE html>
<html lang="en">
<body>
  <img src="hero.png">
  <img src="logo.png" alt="Logo">
  <img src="banner.jpg">
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const imgAltIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'img-alt');
    // Two images without alt (hero.png and banner.jpg), one with alt is fine
    expect(imgAltIssues.length).toBe(2);
    expect(imgAltIssues[0].severity).toBe('critical');
    // Verify the detected issues reference actual lines
    expect(imgAltIssues.every((d) => d.location.line! > 0)).toBe(true);
  });

  it('should detect empty buttons without accessible names', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      `<!DOCTYPE html>
<html lang="en">
<body>
  <button>Click me</button>
  <button></button>
  <button class="icon-btn"></button>
  <button aria-label="Close"></button>
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const buttonIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'button-name');
    // Two buttons without accessible names (the empty ones)
    expect(buttonIssues.length).toBe(2);
    expect(buttonIssues[0].severity).toBe('critical');
  });

  it('should detect form inputs missing id/label association', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'form.html'),
      `<!DOCTYPE html>
<html lang="en">
<body>
  <form>
    <input type="text" placeholder="Name">
    <input type="email" id="email" />
    <textarea placeholder="Comment"></textarea>
    <select><option>Choose</option></select>
  </form>
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const labelIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'label');
    // Three inputs without id: text input, textarea, select (email has id)
    expect(labelIssues.length).toBe(3);
    expect(labelIssues[0].severity).toBe('critical');
  });

  it('should detect empty links', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'links.html'),
      `<!DOCTYPE html>
<html lang="en">
<body>
  <a href="/home">Home</a>
  <a href="/about"></a>
  <a href="/contact" class="icon-link"></a>
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const linkIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'link-name');
    // Two empty links
    expect(linkIssues.length).toBe(2);
    expect(linkIssues[0].severity).toBe('critical');
  });

  it('should NOT detect issues when all HTML is accessible', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'clean.html'),
      `<!DOCTYPE html>
<html lang="en">
<body>
  <main>
    <img src="photo.jpg" alt="A sunset">
    <button aria-label="Submit form"></button>
    <a href="/about">About us</a>
    <form>
      <label for="name">Name:</label>
      <input type="text" id="name" />
    </form>
  </main>
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const criticalIssues = diagnoses.filter((d) => d.severity === 'critical');
    expect(criticalIssues.length).toBe(0);
  });

  it('should detect multiple issue types in a single file', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'messy.html'),
      `<!DOCTYPE html>
<html>
<body>
  <img src="photo.png">
  <button></button>
  <a href="/"></a>
  <input type="text" />
</body>
</html>`,
      'utf-8'
    );

    const skill = new A11ySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const ruleIds = diagnoses.map((d) => d.metadata?.ruleId);
    expect(ruleIds).toContain('img-alt');
    expect(ruleIds).toContain('button-name');
    expect(ruleIds).toContain('link-name');
    expect(ruleIds).toContain('label');
  });
});

// ---------------------------------------------------------------------------
// Security Skill – real source file detection
// ---------------------------------------------------------------------------

describe('SecuritySkill.diagnose – real source detection', () => {
  it('should detect hardcoded password in source code', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'db.ts'),
      `const config = {
  host: 'localhost',
  password: "SuperSecret123",
  port: 5432
};

export default config;`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const secretIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'hardcoded-secret');
    expect(secretIssues.length).toBe(1);
    expect(secretIssues[0].severity).toBe('critical');
    expect(secretIssues[0].location.file).toBe('db.ts');
    expect(secretIssues[0].location.line).toBe(3);
  });

  it('should detect hardcoded API key', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'api.ts'),
      `const API_KEY = "sk-abcdef1234567890abcdef";
const url = "https://api.example.com/v1";

export async function callApi() {
  return fetch(url, {
    headers: { Authorization: API_KEY }
  });
}`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const secretIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'hardcoded-secret');
    expect(secretIssues.length).toBe(1);
  });

  it('should detect SQL injection via template literal', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'queries.ts'),
      `export async function getUser(userId: string) {
  return db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
}`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const sqlIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'sql-injection');
    expect(sqlIssues.length).toBe(1);
    expect(sqlIssues[0].severity).toBe('critical');
  });

  it('should detect SQL injection via string concatenation', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'repo.ts'),
      `export function search(query: string) {
  return db.execute('SELECT * FROM products WHERE name LIKE "' + query + '"');
}`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const sqlIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'sql-injection');
    expect(sqlIssues.length).toBe(1);
  });

  it('should detect XSS via dangerouslySetInnerHTML', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'Component.tsx'),
      `export function RichText({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const xssIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'xss-risk');
    expect(xssIssues.length).toBe(1);
  });

  it('should detect eval usage', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'eval.ts'),
      `function parseConfig(input: string) {
  return eval('(' + input + ')');
}`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const evalIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'eval-usage');
    expect(evalIssues.length).toBe(1);
  });

  it('should detect insecure HTTP URLs (excluding localhost)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'fetch.ts'),
      `const publicApi = fetch('http://api.example.com/data');
const localApi = fetch('http://localhost:3000/api');
const loopback = fetch('http://127.0.0.1:8080');`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const httpIssues = diagnoses.filter((d) => d.metadata?.ruleId === 'http-url');
    expect(httpIssues.length).toBe(1); // Only the external HTTP URL
    expect(httpIssues[0].location.line).toBe(1);
  });

  it('should NOT flag secrets in comment lines', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'safe.ts'),
      `// password = "test123"
* apiKey = "sk-demo"
const greeting = "Hello World";`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    expect(diagnoses.length).toBe(0);
  });

  it('should NOT flag security patterns in test files', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'auth.test.ts'),
      `describe('Auth', () => {
  it('should reject bad password', () => {
    const password = "test123";
    expect(auth.verify(password)).toBe(false);
  });
});`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    expect(diagnoses.length).toBe(0);
  });

  it('should detect multiple security issue types in one file', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'vulnerable.ts'),
      `const password = "admin123";

export function search(term: string) {
  return db.query(\`SELECT * FROM items WHERE name = \${term}\`);
}

export function render(html: string) {
  element.innerHTML = '<p>' + html + '</p>';
}

const data = fetch('http://external-api.com/data');`,
      'utf-8'
    );

    const skill = new SecuritySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const ruleIds = diagnoses.map((d) => d.metadata?.ruleId);
    expect(ruleIds).toContain('hardcoded-secret');
    expect(ruleIds).toContain('sql-injection');
    expect(ruleIds).toContain('xss-risk');
    expect(ruleIds).toContain('http-url');
  });
});

// ---------------------------------------------------------------------------
// Dependency Skill – real package.json detection
// ---------------------------------------------------------------------------

describe('DependencySkill.diagnose – real package.json detection', () => {
  it('should detect git URL dependencies', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        dependencies: {
          'react': '^18.0.0',
          'my-fork': 'git+https://github.com/user/forked-lib.git',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const gitUrlIssues = diagnoses.filter((d) => d.metadata?.type === 'git-url');
    expect(gitUrlIssues.length).toBe(1);
    expect(gitUrlIssues[0].metadata.package).toBe('my-fork');
    expect(gitUrlIssues[0].severity).toBe('warning');
  });

  it('should detect duplicate dependencies (in deps and devDeps)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21',
        },
        devDependencies: {
          'lodash': '^4.17.21',
          'typescript': '^5.0.0',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const dupIssues = diagnoses.filter((d) => d.metadata?.type === 'duplicate');
    expect(dupIssues.length).toBe(1);
    expect(dupIssues[0].metadata.package).toBe('lodash');
  });

  it('should detect unsafe version ranges (* and latest)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        dependencies: {
          'express': '*',
          'cors': 'latest',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const unsafeIssues = diagnoses.filter((d) => d.metadata?.type === 'unsafe-version');
    expect(unsafeIssues.length).toBe(2);
  });

  it('should detect dev-tool in production dependencies', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        dependencies: {
          'eslint': '^8.0.0',
          'typescript': '^5.0.0',
          'express': '^4.18.0',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const placementIssues = diagnoses.filter((d) => d.metadata?.type === 'wrong-placement');
    expect(placementIssues.length).toBe(2);
    const packages = placementIssues.map((d) => d.metadata.package);
    expect(packages).toContain('eslint');
    expect(packages).toContain('typescript');
  });

  it('should detect exact pinned versions', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        dependencies: {
          'lodash': '4.17.21',
          'express': '^4.18.2',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const exactIssues = diagnoses.filter((d) => d.metadata?.type === 'exact-version');
    expect(exactIssues.length).toBe(1);
    expect(exactIssues[0].metadata.package).toBe('lodash');
  });

  it('should detect peer dependency in regular dependencies', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-lib',
        version: '1.0.0',
        dependencies: {
          'react': '^18.0.0',
        },
        peerDependencies: {
          'react': '>=16.0.0',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const peerIssues = diagnoses.filter((d) => d.metadata?.type === 'peer-in-deps');
    expect(peerIssues.length).toBe(1);
    expect(peerIssues[0].metadata.package).toBe('react');
  });

  it('should detect multiple dependency issues in a messy package.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'messy-app',
        version: '1.0.0',
        dependencies: {
          'react': '^16.8.0',
          'eslint': '^8.0.0',
          'my-utils': 'git+https://github.com/user/utils.git',
          'fixed-ver': '1.0.0',
          'anything': '*',
        },
        devDependencies: {
          'react': '^16.8.0',
          'typescript': '^5.0.0',
        },
        peerDependencies: {
          'react': '>=16.0.0',
        },
      }, null, 2),
      'utf-8'
    );

    const skill = new DependencySkill();
    const diagnoses = await skill.diagnose(makeContext());

    const ruleIds = diagnoses.map((d) => d.metadata?.type);
    expect(ruleIds).toContain('outdated');
    expect(ruleIds).toContain('wrong-placement');
    expect(ruleIds).toContain('git-url');
    expect(ruleIds).toContain('exact-version');
    expect(ruleIds).toContain('unsafe-version');
    expect(ruleIds).toContain('duplicate');
    expect(ruleIds).toContain('peer-in-deps');
    expect(diagnoses.length).toBeGreaterThan(5);
  });
});
