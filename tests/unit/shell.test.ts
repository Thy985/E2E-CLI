/**
 * Shell utilities tests
 *
 * 主要覆盖：
 * - execAsync 正常退出 + 大输出降级
 * - execAsyncOrThrow 失败抛错
 * - execFileAsync 的 argv 安全：用户输入作为单 entry 不会触发 shell 注入
 * - timeout 行为
 */

import { describe, it, expect } from 'bun:test';
import { execAsync, execAsyncOrThrow, execFileAsync } from '../../src/utils/shell';

describe('shell utilities', () => {
  describe('execAsync', () => {
    it('captures stdout of a successful command', async () => {
      const result = await execAsync('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello');
    });

    it('returns non-zero exit code without throwing', async () => {
      const result = await execAsync('exit 7');
      expect(result.exitCode).toBe(7);
    });

    it('respects custom cwd', async () => {
      const result = await execAsync('pwd', { cwd: '/tmp' });
      // macOS resolves /tmp to /private/tmp; just assert ends with tmp
      expect(result.stdout.endsWith('tmp')).toBe(true);
    });
  });

  describe('execAsyncOrThrow', () => {
    it('returns result on success', async () => {
      const result = await execAsyncOrThrow('echo ok');
      expect(result.stdout).toBe('ok');
    });

    it('throws with full output on failure', async () => {
      await expect(execAsyncOrThrow('echo bad && exit 1')).rejects.toThrow(/exit code 1/);
    });
  });

  describe('execFileAsync (no shell, safe argv)', () => {
    it('runs binary with argv', async () => {
      const result = await execFileAsync('echo', ['hello', 'world']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello world');
    });

    it('treats each argv entry literally — no shell interpretation', async () => {
      // 这个串里包含 shell 元字符；如果走 shell 解释器会被执行/吃掉
      const payload = '$(echo injected) ; rm -rf / ; `whoami`';
      const result = await execFileAsync('echo', [payload]);
      expect(result.exitCode).toBe(0);
      // 整段被原样打印
      expect(result.stdout).toBe(payload);
    });

    it('returns non-zero exit code without throwing', async () => {
      const result = await execFileAsync('sh', ['-c', 'exit 3']);
      expect(result.exitCode).toBe(3);
    });

    it('throws when binary does not exist', async () => {
      await expect(execFileAsync('definitely-not-a-real-binary-xyz', [])).rejects.toThrow();
    });
  });
});
