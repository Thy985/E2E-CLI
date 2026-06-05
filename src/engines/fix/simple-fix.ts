/**
 * Simple Fix Engine
 *
 * @deprecated Use `FixEngine` from `./index` instead. This module is kept
 * only for backward compatibility and simply re-exports FixEngine.
 *
 * SimpleFixEngine was a simplified variant of the main FixEngine that lacked
 * risk assessment, sandbox preview, rollback, and verification. Since the
 * main FixEngine now covers all these cases, this wrapper exists solely to
 * prevent breakage for any code that still imports from this path.
 */

export { FixEngine as SimpleFixEngine } from './index';
export type { FixEngineConfig, FixResult } from './index';

export { default } from './index';
