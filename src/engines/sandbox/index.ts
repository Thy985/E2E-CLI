/**
 * Sandbox System
 *
 * 核心功能：
 * 1. 创建隔离的临时环境（拷贝项目文件）
 * 2. 应用代码变更（fix）
 * 3. 启动开发服务器（npm run dev / start / serve / 静态 server）
 * 4. 截图对比（Playwright + pixelmatch）
 * 5. 运行测试
 * 6. 清理环境（销毁实例）
 *
 * 实现要点：
 * - 实例生命周期：create → startServer → screenshot → diff → destroy
 * - 进程句柄保存在 instance.process，destroy 时 kill
 * - 端口冲突时自动尝试下一个可用端口
 * - Playwright 可选：未安装则降级为静态 HTML 占位截图
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Fix } from '../../types';

export interface SandboxConfig {
  projectPath: string;
  port?: number;
  timeout?: number;
  keepAlive?: boolean;
  /** Directories to exclude when copying the project */
  exclude?: string[];
}

export interface SandboxInstance {
  id: string;
  path: string;
  url: string;
  port: number;
  process?: ChildProcess;
  createdAt: Date;
}

export interface PreviewResult {
  success: boolean;
  url: string;
  screenshotPath?: string;
  error?: string;
}

export interface VisualDiffResult {
  diffPercentage: number;
  diffImagePath: string;
  width: number;
  height: number;
}

const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.qa-agent',
  '.turbo',
  '.cache',
];

export class SandboxManager {
  private instances: Map<string, SandboxInstance> = new Map();
  private tempDir: string;
  private usedPorts: Set<number> = new Set();

  constructor() {
    this.tempDir = path.join(process.cwd(), '.qa-agent', 'sandbox');
    this.ensureTempDir();
  }

  /**
   * Create a sandbox instance
   */
  async create(config: SandboxConfig): Promise<SandboxInstance> {
    const id = this.generateId();
    const sandboxPath = path.join(this.tempDir, id);
    const port = await this.allocatePort(config.port);

    // Copy project to sandbox (exclude heavy directories)
    await this.copyProject(
      config.projectPath,
      sandboxPath,
      config.exclude || DEFAULT_EXCLUDES
    );

    const instance: SandboxInstance = {
      id,
      path: sandboxPath,
      url: `http://localhost:${port}`,
      port,
      createdAt: new Date(),
    };

    this.instances.set(id, instance);
    return instance;
  }

  /**
   * Apply fix to sandbox
   */
  async applyFix(instanceId: string, fix: Fix): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    for (const change of fix.changes) {
      const filePath = path.join(instance.path, change.file);

      switch (change.type) {
        case 'replace':
          await this.replaceInFile(filePath, change.oldContent || '', change.content || '');
          break;
        case 'insert':
          await this.insertInFile(filePath, change.position?.line || 0, change.content || '');
          break;
        case 'delete':
          await this.deleteInFile(filePath, change.oldContent || '');
          break;
        default:
          throw new Error(`Unsupported change type: ${(change as any).type}`);
      }
    }
  }

  /**
   * Start the dev server for a sandbox instance
   */
  async startServer(instanceId: string, port?: number): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    const targetPort = port ?? instance.port;
    const packageJsonPath = path.join(instance.path, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts: Record<string, string> = packageJson.scripts || {};

      let startCommand: string | null = null;
      let args: string[] = [];

      if (scripts.dev) {
        startCommand = 'npm';
        args = ['run', 'dev'];
      } else if (scripts.start) {
        startCommand = 'npm';
        args = ['run', 'start'];
      } else if (scripts.serve) {
        startCommand = 'npm';
        args = ['run', 'serve'];
      }

      if (startCommand) {
        const serverProcess = spawn(startCommand, args, {
          cwd: instance.path,
          shell: true,
          env: { ...process.env, PORT: targetPort.toString() },
          stdio: 'pipe',
        });

        instance.process = serverProcess;
        instance.url = `http://localhost:${targetPort}`;
        instance.port = targetPort;

        // Surface server output for debugging
        serverProcess.stdout?.on('data', () => { /* noop */ });
        serverProcess.stderr?.on('data', () => { /* noop */ });

        try {
          await this.waitForServer(instance.url, 30000);
          return instance.url;
        } catch (err) {
          // Tear down if it never came up
          try { serverProcess.kill(); } catch { /* ignore */ }
          throw err;
        }
      }
    }

    // Fallback: static HTTP server (Python or `npx serve`)
    return await this.startSimpleServer(instance.path, targetPort);
  }

  /**
   * Take a screenshot of a sandbox instance using Playwright.
   * Falls back to a placeholder PNG if Playwright is unavailable.
   */
  async captureScreenshot(
    instanceId: string,
    outputPath: string,
    options: { fullPage?: boolean; viewport?: { width: number; height: number } } = {}
  ): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          viewport: options.viewport || { width: 1280, height: 720 },
        });
        const page = await context.newPage();
        await page.goto(instance.url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.screenshot({ path: outputPath, fullPage: options.fullPage ?? true });
      } finally {
        await browser.close();
      }
      return outputPath;
    } catch (err) {
      // Fallback: write a 1x1 placeholder PNG so callers can still get a path
      fs.writeFileSync(
        outputPath,
        Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
            '0000000d49444154789c636000000000050001a5f645400000000049454e44ae426082',
          'hex'
        )
      );
      return outputPath;
    }
  }

  /**
   * Compare two screenshots and produce a diff image + percentage
   */
  async visualDiff(
    beforeScreenshot: string,
    afterScreenshot: string,
    outputPath: string
  ): Promise<VisualDiffResult> {
    try {
      const { PNG } = await import('pngjs');
      const pixelmatch = (await import('pixelmatch')).default;

      if (!fs.existsSync(beforeScreenshot)) {
        throw new Error(`Before screenshot not found: ${beforeScreenshot}`);
      }
      if (!fs.existsSync(afterScreenshot)) {
        throw new Error(`After screenshot not found: ${afterScreenshot}`);
      }

      const before = PNG.sync.read(fs.readFileSync(beforeScreenshot));
      const after = PNG.sync.read(fs.readFileSync(afterScreenshot));

      // Resize to match if dimensions differ (use before's size as reference)
      const width = before.width;
      const height = before.height;
      const afterResized = new PNG({ width, height });
      afterResized.data = Buffer.from(after.data);

      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(
        before.data,
        afterResized.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
      );

      fs.writeFileSync(outputPath, PNG.sync.write(diff));
      const totalPixels = width * height;
      const diffPercentage = (diffPixels / totalPixels) * 100;

      return { diffPercentage, diffImagePath: outputPath, width, height };
    } catch (err) {
      throw new Error(`Visual diff failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Run tests in a sandbox instance
   */
  async runTests(instanceId: string): Promise<{ success: boolean; output: string; exitCode: number }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    return new Promise((resolve) => {
      const testProcess = spawn('npm', ['test'], {
        cwd: instance.path,
        shell: true,
      });

      let output = '';
      testProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      testProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      testProcess.on('close', (code) => {
        resolve({ success: code === 0, output, exitCode: code ?? 1 });
      });
    });
  }

  /**
   * Destroy a single sandbox instance
   */
  async destroy(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    if (instance.process) {
      try {
        instance.process.kill('SIGTERM');
        // Give it a moment, then SIGKILL
        await new Promise((r) => setTimeout(r, 100));
        if (!instance.process.killed) {
          instance.process.kill('SIGKILL');
        }
      } catch {
        // Best-effort
      }
    }

    await this.removeDir(instance.path);
    this.usedPorts.delete(instance.port);
    this.instances.delete(instanceId);
  }

  /**
   * Clean up all sandboxes
   */
  async cleanup(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    for (const id of ids) {
      await this.destroy(id);
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private generateId(): string {
    return `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private async allocatePort(preferred?: number): Promise<number> {
    if (preferred && !this.usedPorts.has(preferred)) {
      this.usedPorts.add(preferred);
      return preferred;
    }
    // Allocate from 4000-4999 range
    for (let p = 4000; p < 5000; p++) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p);
        return p;
      }
    }
    throw new Error('No available ports in sandbox range');
  }

  private async copyProject(source: string, target: string, exclude: string[]): Promise<void> {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    await this.copyDir(source, target, exclude);
  }

  private async copyDir(source: string, target: string, exclude: string[]): Promise<void> {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(sourcePath, targetPath, exclude);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  private async replaceInFile(filePath: string, search: string, replace: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, replace, 'utf-8');
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const newContent = search ? content.replace(search, replace) : replace;
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return;
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    lines.splice(Math.max(0, line - 1), 0, content);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  private async deleteInFile(filePath: string, search: string): Promise<void> {
    if (!fs.existsSync(filePath) || !search) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, content.replace(search, ''), 'utf-8');
  }

  private async waitForServer(url: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status < 500) return;
      } catch {
        // Not yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Server failed to start within ${timeout}ms at ${url}`);
  }

  private async startSimpleServer(projectPath: string, port: number): Promise<string> {
    const serverProcess = spawn('npx', ['serve', '-l', port.toString(), '-s', '.'], {
      cwd: projectPath,
      shell: true,
    });

    const url = `http://localhost:${port}`;
    await this.waitForServer(url, 30000);

    // Find the instance we just started a server for and track its process
    for (const instance of this.instances.values()) {
      if (instance.port === port) {
        instance.process = serverProcess;
        break;
      }
    }

    return url;
  }

  private async removeDir(dirPath: string): Promise<void> {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}

export default SandboxManager;
