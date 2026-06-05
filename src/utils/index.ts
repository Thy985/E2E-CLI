/**
 * Utility barrel
 *
 * 重新导出拆分子模块，保留对 `import ... from '.../utils'` 的兼容。
 *
 * 注意：matchPattern / deepMerge / pick / omit 之前是死代码，已删除。
 * 如需 glob 匹配请用 minimatch（已在 dependencies）。
 */

export { generateId, hash } from './id';
export { formatDuration, formatSize } from './format';
export { sleep, retry, debounce, throttle } from './async';
export { groupBy } from './array';
export { calculateScore, getGrade, SEVERITY_WEIGHTS } from './scoring';
export type { IssueLike } from './scoring';
