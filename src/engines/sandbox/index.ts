/**
 * Sandbox Manager
 * Manages isolated, temporary working copies of the user's project for safe
 * experimentation and verification.
 *
 * 设计要点：
 * 1. 拷贝走异步 fs.promises，不阻塞事件循环
 * 2. 启动命令由用户 package.json 自动推断
 * 3. captureScreenshot / visualDiff 显式抛错而非假装成功
 *    —— 删除 web/gui 之后我们没装 headless browser，不应继续伪造数据
 */

import { spawn, ChildProcess } from 'child_process';
import * as fsp from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SandboxInstance {
  id: string;
  path: string;
  url?: string;
  process?: ChildProcess;
  createdAt: number;
}

export class SandboxManager {
  private instances: Map<string, SandboxInstance> = new Map();
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir ?? path.join(os.tmpdir(), 'qa-agent-sandbox');
  }

  /**
   * Create a sandbox instance by copying the project
   */
  async create(projectPath: string): Promise<string> {
    await fsp.mkdir(this.tempDir, { recursive: true });
    const id = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const targetPath = path.join(this.tempDir, id);

    await this.copyProject(projectPath, targetPath);

    const instance: SandboxInstance = {
      id,
      path: targetPath,
      createdAt: Date.now(),
    };
    this.instances.set(id, instance);

    return id;
  }

  /**
   * Start the project's dev server in the sandbox
   */
  async startServer(instanceId: string, port: number = 3000): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    const packageJsonPath = path.join(instance.path, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      const startCommand = this.pickStartCommand(scripts);

      const serverProcess = spawn(startCommand, [], {
        cwd: instance.path,
        shell: true,
        env: { ...process.env, PORT: port.toString() },
      });
      instance.process = serverProcess;
      instance.url = `http://localhost:${port}`;

      await this.waitForServer(instance.url);
      return instance.url;
    }

    return await this.startSimpleServer(instance.path, port);
  }

  /**
   * 截图
   *
   * 之前返回的是一坨字符串占位符。删了 web/gui 之后我们没有 headless
   * browser，不能再给假数据；改为显式抛错，让上游 fallback 到 "skip visual check"。
   */
  async captureScreenshot(_instanceId: string, _outputPath: string): Promise<string> {
    throw new Error(
      'SandboxManager.captureScreenshot is not available: headless browser support ' +
      'was removed when the web/gui frontends were cut. Use a CLI skill (e.g. e2e ' +
      'headless) or pass `--skip-visual` to opt out of screenshot-based verification.'
    );
  }

  /**
   * 视觉对比
   *
   * 之前恒返回 diffPercentage=0 —— 上游会以为 "没有差异" 错放 bug 出门。
   * 改为显式抛错。
   */
  async visualDiff(
    _beforeScreenshot: string,
    _afterScreenshot: string,
    _outputPath: string
  ): Promise<{ diffPercentage: number; diffImagePath: string }> {
    throw new Error(
      'SandboxManager.visualDiff is not available: pixelmatch was removed when the ' +
      'web/gui frontends were cut. Visual regression checks are unsupported in CLI mode.'
    );
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
      testProcess.stdout?.on('data', (d) => { output += d.toString(); });
      testProcess.stderr?.on('data', (d) => { output += d.toString(); });
      testProcess.on('close', (code) => resolve({ success: code === 0, output }));
    });
  }

  /**
   * 销毁沙箱实例
   */
  async destroy(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    if (instance.process) {
      try { instance.process.kill(); } catch { /* already exited */ }
    }
    await fsp.rm(instance.path, { recursive: true, force: true });
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

  // ============= private helpers =============

  private pickStartCommand(scripts: Record<string, string>): string {
    if (scripts.dev) return 'npm run dev';
    if (scripts.start) return 'npm start';
    if (scripts.serve) return 'npm run serve';
    return 'npm run dev';
  }

  private async copyProject(source: string, target: string): Promise<void> {
    await this.copyDir(source, target, new Set([
      'node_modules', '.git', 'dist', 'build', '.qa-agent', '.next', '.nuxt',
    ]));
  }

  private async copyDir(source: string, target: string, exclude: Set<string>): Promise<void> {
    await fsp.mkdir(target, { recursive: true });
    const entries = await fsp.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (exclude.has(entry.name)) continue;
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(sourcePath, targetPath, exclude);
      } else if (entry.isFile()) {
        await fsp.copyFile(sourcePath, targetPath);
      }
      // 跳过 symlink/socket/device 等特殊文件类型
    }
  }

  private async replaceInFile(filePath: string, search: string | RegExp, replace: string): Promise<void> {
    const content = await fsp.readFile(filePath, 'utf-8');
    await fsp.writeFile(filePath, content.replace(search, replace), 'utf-8');
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    const lines = (await fsp.readFile(filePath, 'utf-8')).split('\n');
    lines.splice(line, 0, content);
    await fsp.writeFile(filePath, lines.join('\n'), 'utf-8');
  }

  private async waitForServer(url: string, timeout: number = 30000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // server not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Server failed to start within ${timeout}ms: ${url}`);
  }

  private async startSimpleServer(projectPath: string, port: number): Promise<string> {
    const serverProcess = spawn('npx', ['serve', '-l', port.toString()], {
      cwd: projectPath,
      shell: true,
    });

    // fire-and-forget; if it exits immediately the next waitForServer will time out
    void serverProcess;

    const url = `http://localhost:${port}`;
    await this.waitForServer(url);
    return url;
  }
}
