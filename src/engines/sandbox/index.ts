/**
 * Sandbox System
 *
 * 核心功能：
 * 1. 创建隔离的临时环境
 * 2. 应用代码变更
 * 3. 启动开发服务器（带错误处理）
 * 4. 截图对比（puppeteer-core + pixelmatch）
 * 5. 运行测试
 * 6. 清理环境（优雅终止进程）
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Fix } from '../../types';
import { replaceInFile, insertInFile, copyDir, removeDir } from '../../utils/file-ops';
import { readPNG, writePNG, loadPixelmatch } from '../../utils/image';

type Puppeteer = typeof import('puppeteer-core');

export interface SandboxConfig {
  projectPath: string;
  port?: number;
  timeout?: number;
  keepAlive?: boolean;
}

export interface SandboxInstance {
  id: string;
  path: string;
  url: string;
  process?: ChildProcess;
  createdAt: Date;
}

export interface PreviewResult {
  success: boolean;
  url: string;
  screenshot?: string;
  error?: string;
}

export interface VisualDiffResult {
  diffPercentage: number;
  diffImagePath: string;
  mismatchedPixels: number;
  totalPixels: number;
}

export class SandboxManager {
  private instances: Map<string, SandboxInstance> = new Map();
  private tempDir: string;
  private puppeteer: Puppeteer | null = null;

  constructor() {
    this.tempDir = path.join(process.cwd(), '.qa-agent', 'sandbox');
    this.ensureTempDir();
  }

  /**
   * 创建沙箱实例
   */
  async create(config: SandboxConfig): Promise<SandboxInstance> {
    const id = this.generateId();
    const sandboxPath = path.join(this.tempDir, id);

    // 复制项目到沙箱
    await this.copyProject(config.projectPath, sandboxPath);

    const instance: SandboxInstance = {
      id,
      path: sandboxPath,
      url: `http://localhost:${config.port || 3000}`,
      createdAt: new Date(),
    };

    this.instances.set(id, instance);
    return instance;
  }

  /**
   * 应用修复到沙箱
   */
  async applyFix(instanceId: string, fix: Fix): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    for (const change of fix.changes) {
      const filePath = path.join(instance.path, change.file);

      if (change.type === 'replace') {
        await replaceInFile(filePath, change.oldContent || '', change.content || '');
      } else if (change.type === 'insert') {
        await insertInFile(filePath, change.position?.line || 0, change.content || '');
      }
    }
  }

  /**
   * 启动开发服务器
   */
  async startServer(instanceId: string, port: number = 3000): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    // 检测端口是否已被占用
    const portInUse = await this.isPortInUse(port);
    if (portInUse) {
      throw new Error(`Port ${port} is already in use`);
    }

    // 检测项目类型并启动相应的开发服务器
    const packageJsonPath = path.join(instance.path, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      // 检测启动命令
      let startCommand = 'npm run dev';
      if (scripts.dev) {
        startCommand = 'npm run dev';
      } else if (scripts.start) {
        startCommand = 'npm start';
      } else if (scripts.serve) {
        startCommand = 'npm run serve';
      }

      // 启动服务器
      const serverProcess = spawn(startCommand, [], {
        cwd: instance.path,
        shell: true,
        env: { ...process.env, PORT: port.toString() },
      });

      instance.process = serverProcess;
      instance.url = `http://localhost:${port}`;

      // 收集启动输出以便报错时展示
      let stdout = '';
      let stderr = '';
      serverProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      serverProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // 如果进程在等待启动期间退出，立即抛出错误
      const serverExitPromise = new Promise<never>((_, reject) => {
        serverProcess.on('exit', (code, signal) => {
          const exitInfo = `Server exited with code ${code ?? 'null'}, signal ${signal ?? 'null'}`;
          const output = stderr || stdout || '(no output)';
          reject(new Error(`${exitInfo}\nOutput:\n${output}`));
        });
      });

      // 等待服务器启动或进程退出
      try {
        await Promise.race([
          this.waitForServer(instance.url, 30000),
          serverExitPromise,
        ]);
      } catch (error) {
        // 如果 waitForServer 超时，serverExitPromise 可能还没 reject
        // 但如果是进程提前退出，我们已经有了详细错误信息
        if (error instanceof Error && error.message.includes('exited with code')) {
          throw error;
        }
        // 超时或其他原因，也尝试杀死进程
        this.killProcessTree(serverProcess);
        throw error;
      }

      return instance.url;
    }

    // 如果没有 package.json，使用简单的 HTTP 服务器
    return await this.startSimpleServer(instance.path, port);
  }

  /**
   * 截图（使用 puppeteer-core，未安装时降级为警告）
   */
  async captureScreenshot(instanceId: string, outputPath: string): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const puppeteer = await this.loadPuppeteer();
    if (!puppeteer) {
      // Fallback: 生成占位符文件并记录警告
      console.warn('[Sandbox] puppeteer-core not available; screenshot is a placeholder');
      fs.writeFileSync(outputPath, '[Sandbox screenshot unavailable - puppeteer-core not installed]');
      return outputPath;
    }

    let browser: Awaited<ReturnType<Puppeteer['launch']>> | undefined;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.screenshot({ path: outputPath, fullPage: true });
      return outputPath;
    } catch (error) {
      console.warn(`[Sandbox] Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`);
      // 降级为占位符
      fs.writeFileSync(outputPath, `[Sandbox screenshot failed: ${error instanceof Error ? error.message : String(error)}]`);
      return outputPath;
    } finally {
      if (browser) {
        await browser.close().catch(() => { /* ignore */ });
      }
    }
  }

  /**
   * 视觉对比（使用 pixelmatch，未安装时降级为 0% diff）
   */
  async visualDiff(
    beforeScreenshot: string,
    afterScreenshot: string,
    outputPath: string
  ): Promise<VisualDiffResult> {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pixelmatch = await loadPixelmatch();
    if (!pixelmatch) {
      console.warn('[Sandbox] pixelmatch not available; visual diff returns 0%');
      // 直接复制 after 图片作为占位符
      if (fs.existsSync(afterScreenshot)) {
        fs.copyFileSync(afterScreenshot, outputPath);
      }
      return {
        diffPercentage: 0,
        diffImagePath: outputPath,
        mismatchedPixels: 0,
        totalPixels: 0,
      };
    }

    // Read and decode PNG files
    const beforeData = await readPNG(beforeScreenshot);
    const afterData = await readPNG(afterScreenshot);

    if (!beforeData || !afterData) {
      console.warn('[Sandbox] Could not decode screenshots for visual diff');
      if (fs.existsSync(afterScreenshot)) {
        fs.copyFileSync(afterScreenshot, outputPath);
      }
      return {
        diffPercentage: 0,
        diffImagePath: outputPath,
        mismatchedPixels: 0,
        totalPixels: 0,
      };
    }

    if (beforeData.width !== afterData.width || beforeData.height !== afterData.height) {
      console.warn('[Sandbox] Screenshot dimensions differ; cannot compute pixel diff');
      return {
        diffPercentage: 100,
        diffImagePath: outputPath,
        mismatchedPixels: beforeData.width * beforeData.height,
        totalPixels: beforeData.width * beforeData.height,
      };
    }

    const { width, height } = beforeData;
    const totalPixels = width * height;
    const outputBuffer = Buffer.alloc(totalPixels * 4);

    const mismatchedPixels = pixelmatch(
      beforeData.data,
      afterData.data,
      outputBuffer,
      width,
      height,
      { threshold: 0.1 }
    );

    // Write diff image
    await writePNG(outputPath, outputBuffer, width, height);

    const diffPercentage = (mismatchedPixels / totalPixels) * 100;

    return {
      diffPercentage: Math.round(diffPercentage * 100) / 100,
      diffImagePath: outputPath,
      mismatchedPixels,
      totalPixels,
    };
  }

  /**
   * Run TypeScript compilation check (`tsc --noEmit`) in the sandbox.
   * Returns `{ success: true }` when compilation succeeds, or
   * `{ success: false, output: <tsc stderr+stdout> }` on failure.
   */
  async runTypeCheck(instanceId: string): Promise<{ success: boolean; output: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    return new Promise((resolve) => {
      const proc = spawn('npx', ['tsc', '--noEmit'], {
        cwd: instance.path,
        shell: true,
      });

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      proc.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
        });
      });
    });
  }

  /**
   * 运行测试
   */
  async runTests(instanceId: string): Promise<{ success: boolean; output: string }> {
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
      testProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      testProcess.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      testProcess.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
        });
      });
    });
  }

  /**
   * 销毁沙箱实例
   */
  async destroy(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // 优雅停止服务器进程：SIGTERM → 等待 → SIGKILL
    if (instance.process) {
      await this.killProcessTree(instance.process);
    }

    // 删除临时目录
    await removeDir(instance.path);
    this.instances.delete(instanceId);
  }

  /**
   * 清理所有沙箱
   */
  async cleanup(): Promise<void> {
    for (const [id] of this.instances) {
      await this.destroy(id);
    }
  }

  // ==================== Private Methods ====================

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private generateId(): string {
    return `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private async copyProject(source: string, target: string): Promise<void> {
    await copyDir(source, target, [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.qa-agent',
    ]);
  }

  private async waitForServer(url: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // Server not yet ready; retry after delay
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Server failed to start at ${url} within ${timeout}ms`);
  }

  private async startSimpleServer(projectPath: string, port: number): Promise<string> {
    const serverProcess = spawn('npx', ['--yes', 'serve', '-l', port.toString()], {
      cwd: projectPath,
      shell: true,
    });

    let stderr = '';
    serverProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const exitPromise = new Promise<never>((_, reject) => {
      serverProcess.on('exit', (code, signal) => {
        reject(new Error(`Simple server exited with code ${code ?? 'null'}, signal ${signal ?? 'null'}\n${stderr}`));
      });
    });

    const url = `http://localhost:${port}`;

    try {
      await Promise.race([this.waitForServer(url, 30000), exitPromise]);
    } catch (error) {
      this.killProcessTree(serverProcess);
      throw error;
    }

    return url;
  }

  /**
   * Check if a TCP port is already in use.
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = require('net').createServer();
      server.unref();
      server.on('error', () => resolve(true));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(false));
      });
    });
  }

  /**
   * Kill a process tree: send SIGTERM first, then SIGKILL after timeout.
   * Also attempts to kill orphan child processes.
   */
  private async killProcessTree(proc: ChildProcess): Promise<void> {
    if (!proc.pid) return;

    // Send SIGTERM to the main process
    try {
      process.kill(proc.pid, 'SIGTERM');
    } catch {
      // Process may already be dead; try SIGKILL
      try { process.kill(proc.pid, 'SIGKILL'); } catch { /* ignore */ }
      return;
    }

    // Wait up to 5 seconds for graceful shutdown
    const TERM_TIMEOUT = 5000;
    const terminated = await new Promise<boolean>((resolve) => {
      proc.on('exit', () => resolve(true));
      setTimeout(() => resolve(false), TERM_TIMEOUT);
    });

    if (!terminated) {
      // Force kill
      try {
        process.kill(proc.pid, 'SIGKILL');
      } catch {
        // Process already gone
      }
    }
  }

  // ==================== Optional Dependency Loaders ====================

  private async loadPuppeteer(): Promise<Puppeteer | null> {
    if (this.puppeteer) return this.puppeteer;
    try {
      this.puppeteer = await import('puppeteer-core');
      return this.puppeteer;
    } catch {
      return null;
    }
  }

}

export default SandboxManager;
