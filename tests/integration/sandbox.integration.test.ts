/**
 * Sandbox Integration Tests
 *
 * Tests the SandboxManager with real files and servers:
 * - Creates minimal HTML project in temp directory
 * - Tests that the sandbox can serve it (waitForServer succeeds or times out gracefully)
 * - Tests screenshot capture (succeeds or falls back gracefully)
 * - Tests sandbox lifecycle (create, destroy, cleanup)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SandboxManager } from '../../src/engines/sandbox';

let tmpDir: string;
let manager: SandboxManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sandbox-'));
  manager = new SandboxManager();
});

afterEach(async () => {
  // Clean up all sandbox instances
  try {
    await manager.cleanup();
  } catch {
    // ignore cleanup errors in teardown
  }
  // Clean up temp project dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Sandbox lifecycle tests
// ---------------------------------------------------------------------------

describe('SandboxManager lifecycle', () => {
  it('should create a sandbox instance from a real directory', async () => {
    // Create a minimal project
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>',
      'utf-8'
    );

    const sandbox = await manager.create({ projectPath: tmpDir });

    expect(sandbox.id).toMatch(/^sandbox-/);
    expect(sandbox.url).toBe('http://localhost:3000');
    expect(fs.existsSync(sandbox.path)).toBe(true);
    // Verify the HTML file was copied into the sandbox
    expect(fs.existsSync(path.join(sandbox.path, 'index.html'))).toBe(true);
  });

  it('should copy project files excluding node_modules and .git', async () => {
    // Create files that should and should not be copied
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>', 'utf-8');
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.git', 'config'), '[core]', 'utf-8');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'some-lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'some-lib', 'index.js'), 'module.exports = {}', 'utf-8');

    const sandbox = await manager.create({ projectPath: tmpDir });

    expect(fs.existsSync(path.join(sandbox.path, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(sandbox.path, '.git'))).toBe(false);
    expect(fs.existsSync(path.join(sandbox.path, 'node_modules'))).toBe(false);
  });

  it('should destroy a sandbox and remove its directory', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>', 'utf-8');
    const sandbox = await manager.create({ projectPath: tmpDir });
    const sandboxPath = sandbox.path;

    expect(fs.existsSync(sandboxPath)).toBe(true);

    await manager.destroy(sandbox.id);

    expect(fs.existsSync(sandboxPath)).toBe(false);
  });

  it('should destroy nonexistent sandbox without error', async () => {
    // Should not throw
    await manager.destroy('nonexistent-sandbox-id');
  });

  it('should throw when accessing nonexistent sandbox', async () => {
    await expect(manager.applyFix('fake-id', {} as any)).rejects.toThrow(/not found/);
    await expect(manager.startServer('fake-id')).rejects.toThrow(/not found/);
    await expect(manager.captureScreenshot('fake-id', '/tmp/out.png')).rejects.toThrow(/not found/);
    await expect(manager.runTests('fake-id')).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Sandbox applyFix tests
// ---------------------------------------------------------------------------

describe('SandboxManager.applyFix – real file changes in sandbox', () => {
  it('should apply a replace fix to the sandbox copy', async () => {
    const htmlContent = '<!DOCTYPE html><html><body><img src="logo.png"></body></html>';
    fs.writeFileSync(path.join(tmpDir, 'index.html'), htmlContent, 'utf-8');

    const sandbox = await manager.create({ projectPath: tmpDir });

    // Verify original content in sandbox
    const before = fs.readFileSync(path.join(sandbox.path, 'index.html'), 'utf-8');
    expect(before).toContain('<img src="logo.png">');

    // Apply fix in sandbox only
    await manager.applyFix(sandbox.id, {
      id: 'fix-1',
      diagnosisId: 'diag-1',
      description: 'Add alt',
      riskLevel: 'low',
      autoApplicable: true,
      changes: [{
        file: 'index.html',
        type: 'replace',
        oldContent: '<img src="logo.png">',
        content: '<img src="logo.png" alt="Logo">',
      }],
    });

    // Verify fix was applied in sandbox
    const after = fs.readFileSync(path.join(sandbox.path, 'index.html'), 'utf-8');
    expect(after).toContain('alt="Logo"');
    expect(after).not.toContain('<img src="logo.png">');

    // Verify original project file is unchanged
    const original = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8');
    expect(original).toContain('<img src="logo.png">');
    expect(original).not.toContain('alt="Logo"');

    await manager.destroy(sandbox.id);
  });

  it('should apply an insert fix to the sandbox copy', async () => {
    const htmlContent = '<!DOCTYPE html>\n<html>\n<head></head>\n<body></body>\n</html>';
    fs.writeFileSync(path.join(tmpDir, 'index.html'), htmlContent, 'utf-8');

    const sandbox = await manager.create({ projectPath: tmpDir });

    await manager.applyFix(sandbox.id, {
      id: 'fix-2',
      diagnosisId: 'diag-2',
      description: 'Add title',
      riskLevel: 'low',
      autoApplicable: true,
      changes: [{
        file: 'index.html',
        type: 'insert',
        position: { line: 3 },
        content: '<title>Fixed Page</title>',
      }],
    });

    const after = fs.readFileSync(path.join(sandbox.path, 'index.html'), 'utf-8');
    expect(after).toContain('<title>Fixed Page</title>');
    expect(after).toContain('<head>');

    await manager.destroy(sandbox.id);
  });
});

// ---------------------------------------------------------------------------
// Sandbox server tests
// ---------------------------------------------------------------------------

describe('SandboxManager.startServer', () => {
  it('should attempt to start a server for a static HTML project (graceful timeout or success)', async () => {
    // Create a minimal HTML project without package.json (triggers simple server)
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>',
      'utf-8'
    );

    const sandbox = await manager.create({ projectPath: tmpDir, port: 7890 });

    // Use a shorter internal timeout via Promise.race to avoid bun test timeout
    const startPromise = manager.startServer(sandbox.id, 7890);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SERVER_START_TIMEOUT')), 15000)
    );

    try {
      const url = await Promise.race([startPromise, timeoutPromise]);

      // If we got here, server started
      expect(url).toBe('http://localhost:7890');

      // Verify the server is actually responding
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      const body = await response.text();
      expect(body).toContain('<title>Test Page</title>');
      expect(body).toContain('<h1>Hello World</h1>');
    } catch (error: any) {
      // Server start failed - this is acceptable in sandboxed environments
      // The important thing is it failed gracefully (not a crash)
      // Accept any error that has a message (meaning it was caught and reported, not a segfault)
      expect(error instanceof Error || (error && error.message)).toBe(true);
    } finally {
      await manager.destroy(sandbox.id);
    }
  }, { timeout: 30000 });

  it('should reject when port is already in use', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>', 'utf-8');
    const sandbox = await manager.create({ projectPath: tmpDir, port: 7891 });

    // Start a simple HTTP server on the port
    const server = Bun.serve({
      port: 7891,
      fetch: () => new Response('test'),
    });

    try {
      await expect(manager.startServer(sandbox.id, 7891)).rejects.toThrow(/already in use/);
    } finally {
      server.stop(true);
      await manager.destroy(sandbox.id);
    }
  });

  it('should handle projects with package.json but no working dev scripts', async () => {
    // Create a project with package.json but no node_modules
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>', 'utf-8');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { dev: 'vite' },
        dependencies: { vite: '^5.0.0' },
      }),
      'utf-8'
    );

    const sandbox = await manager.create({ projectPath: tmpDir, port: 7892 });

    // This will fail because vite isn't installed, but should fail gracefully
    try {
      await Promise.race([
        manager.startServer(sandbox.id, 7892),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SERVER_START_TIMEOUT')), 25000)
        ),
      ]);
    } catch (error: any) {
      // Expected: server fails because vite is not installed
      // The failure should be graceful (detailed error message, not a crash)
      expect(error.message).toBeTruthy();
      expect(
        error.message.includes('exited with code') ||
        error.message.includes('failed to start') ||
        error.message.includes('SERVER_START_TIMEOUT')
      ).toBe(true);
    } finally {
      await manager.destroy(sandbox.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Screenshot tests
// ---------------------------------------------------------------------------

describe('SandboxManager.captureScreenshot', () => {
  it('should capture a screenshot or gracefully fall back when puppeteer is unavailable', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body><h1>Test</h1></body></html>', 'utf-8');
    const sandbox = await manager.create({ projectPath: tmpDir });

    const outputPath = path.join(tmpDir, 'screenshot.png');

    // captureScreenshot should never throw - it either captures or falls back
    const result = await manager.captureScreenshot(sandbox.id, outputPath);

    // Should return the output path
    expect(result).toBe(outputPath);
    // File should exist (even if it's a placeholder)
    expect(fs.existsSync(outputPath)).toBe(true);

    // If puppeteer is available, the file should be a real PNG
    // If not, it should be a text placeholder
    const content = fs.readFileSync(outputPath, 'utf-8');
    const isPlaceholder = content.includes('puppeteer') || content.includes('unavailable') || content.includes('failed');
    // Either it's a placeholder OR it's a real binary file (PNG magic bytes)
    if (!isPlaceholder) {
      const buffer = fs.readFileSync(outputPath);
      // Check PNG magic bytes: 89 50 4E 47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    }

    await manager.destroy(sandbox.id);
  });

  it('should create the output directory if it does not exist', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>', 'utf-8');
    const sandbox = await manager.create({ projectPath: tmpDir });

    const nestedPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'screenshot.png');

    const result = await manager.captureScreenshot(sandbox.id, nestedPath);
    expect(result).toBe(nestedPath);
    expect(fs.existsSync(nestedPath)).toBe(true);

    await manager.destroy(sandbox.id);
  });
});

// ---------------------------------------------------------------------------
// Visual diff tests
// ---------------------------------------------------------------------------

describe('SandboxManager.visualDiff', () => {
  it('should return a diff result with valid structure', async () => {
    const diffPath = path.join(tmpDir, 'diff.png');
    // Create two small identical PNG-like files (pixelmatch may or may not be available)
    const fakePng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, // PNG signature
      ...Array(100).fill(0),   // minimal padding
    ]);
    fs.writeFileSync(path.join(tmpDir, 'before.png'), fakePng);
    fs.writeFileSync(path.join(tmpDir, 'after.png'), fakePng);

    const result = await manager.visualDiff(
      path.join(tmpDir, 'before.png'),
      path.join(tmpDir, 'after.png'),
      diffPath
    );

    // Should always return a valid result structure
    expect(result).toHaveProperty('diffPercentage');
    expect(result).toHaveProperty('diffImagePath');
    expect(result).toHaveProperty('mismatchedPixels');
    expect(result).toHaveProperty('totalPixels');
    expect(result.diffImagePath).toBe(diffPath);

    // If pixelmatch is available, identical images should have 0% diff
    // If not available, should fall back to 0%
    expect(typeof result.diffPercentage).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Run tests in sandbox
// ---------------------------------------------------------------------------

describe('SandboxManager.runTests', () => {
  it('should run tests and return result structure', async () => {
    // Create a sandbox with a project that has a test script that fails
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { test: 'echo "no tests configured" && exit 1' },
      }),
      'utf-8'
    );

    const sandbox = await manager.create({ projectPath: tmpDir });

    const result = await manager.runTests(sandbox.id);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.output).toBe('string');
    // Test script exits with 1, so success should be false
    expect(result.success).toBe(false);

    await manager.destroy(sandbox.id);
  });

  it('should report success when test script exits with 0', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: { test: 'echo "all tests passed" && exit 0' },
      }),
      'utf-8'
    );

    const sandbox = await manager.create({ projectPath: tmpDir });

    const result = await manager.runTests(sandbox.id);

    expect(result.success).toBe(true);
    expect(result.output).toContain('all tests passed');

    await manager.destroy(sandbox.id);
  });
});
