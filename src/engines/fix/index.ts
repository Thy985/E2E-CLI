/**
 * Fix Engine (Barrel)
 *
 * v0.3: 修复了 `engines/fix/index.ts` 和 `engines/fix/enhanced.ts` 两个文件
 *       export 同名 `FixEngine` class 的冲突。
 *
 * 历史：
 * - index.ts 原本有基于 SandboxManager 的 FixEngine（sandbox 截图 + 视觉对比）
 * - enhanced.ts 有基于 RollbackManager + VerifyEngine 的 FixEngine（带回滚 + 验证）
 * - cli 用 index，batch + test 用 enhanced — 行为不一致
 *
 * 决定（见 .trae/adr/0003-v03-fix-cleanup.md）：
 * - 保留 enhanced 的实现（功能更完整：rollback + verify + 预览）
 * - 旧的 sandbox-based 实现无人调用 → 通过 barrel re-export 抛弃
 * - 简单修复 + 零破坏（所有 import 路径不变）
 */

export {
  FixEngine,
  type FixEngineOptions,
  type FixResult,
} from './enhanced';
