/**
 * Sandbox System
 * 
 * 核心功能：
 * 1. 创建隔离的临时环境
 * 2. 应用代码变更
 * 3. 启动开发服务器
 * 4. 截图对比
 * 5. 运行测试
 * 6. 清理环境
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

export class SandboxManager {
  private instances: Map<string, SandboxInstance> = new Map();
  private tempDir: string;

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
        await this.replaceInFile(filePath, change.search, change.replace);
      } else if (change.type === 'insert') {
        await this.insertInFile(filePath, change.line!, change.content!);
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

      // 等待服务器启动
      await this.waitForServer(instance.url);

      return instance.url;
    }

    // 如果没有 package.json，使用简单的 HTTP 服务器
    return await this.startSimpleServer(instance.path, port);
  }

  /**
   * 截图
   */
  async captureScreenshot(instanceId: string, outputPath: string): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Sandbox instance ${instanceId} not found`);
    }

    // TODO: 使用 Playwright 截图（需要解决依赖问题）
    // 暂时返回占位符
    fs.writeFileSync(outputPath, 'Screenshot placeholder');
    return outputPath;
  }

  /**
   * 视觉对比
   */
  async visualDiff(
    beforeScreenshot: string,
    afterScreenshot: string,
    outputPath: string
  ): Promise<{ diffPercentage: number; diffImagePath: string }> {
    // 简化实现：返回模拟数据
    // 实际实现需要使用 pixelmatch 库
    return {
      diffPercentage: 0,
      diffImagePath: outputPath,
    };
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
      testProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      testProcess.stderr?.on('data', (data) => {
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

    // 停止服务器进程
    if (instance.process) {
      instance.process.kill();
    }

    // 删除临时目录
    await this.removeDir(instance.path);
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

  // 私有方法

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private generateId(): string {
    return `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async copyProject(source: string, target: string): Promise<void> {
    await this.copyDir(source, target, [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.qa-agent',
    ]);
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

  private async replaceInFile(filePath: string, search: string | RegExp, replace: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const newContent = content.replace(search, replace);
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  private async insertInFile(filePath: string, line: number, content: string): Promise<void> {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    lines.splice(line, 0, content);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  private async waitForServer(url: string, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // 服务器还未启动
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  private async startSimpleServer(projectPath: string, port: number): Promise<string> {
    // 使用 Python 或 Node.js 启动简单 HTTP 服务器
    const serverProcess = spawn('npx', ['serve', '-l', port.toString()], {
      cwd: projectPath,
      shell: true,
    });

    const url = `http://localhost:${port}`;
    await this.waitForServer(url);

    return url;
  }

  private async removeDir(dirPath: string): Promise<void> {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}

export default SandboxManager;
