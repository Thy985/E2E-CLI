/**
 * Ignore pattern matching utilities
 */

/**
 * Check if a path matches any of the given patterns
 */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPattern(filePath, pattern));
}

/**
 * Check if a single pattern matches a path
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Match all
  if (normalizedPattern === '**/*' || normalizedPattern === '**') {
    return true;
  }

  // Pattern like **/*.ext - match any file with extension
  if (normalizedPattern.startsWith('**/*.')) {
    const ext = normalizedPattern.slice(4);
    if (normalizedPath.endsWith(ext)) return true;
    return false;
  }

  // Pattern like dir/** - match anything under directory
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
  }

  // Pattern like dir/* - match direct child
  if (normalizedPattern.endsWith('/*')) {
    const prefix = normalizedPattern.slice(0, -2);
    const rest = normalizedPath.slice(prefix.length + 1);
    return normalizedPath.startsWith(prefix + '/') && !rest.includes('/');
  }

  // Pattern like **/name/** - match directory anywhere
  if (normalizedPattern.startsWith('**/') && normalizedPattern.endsWith('/**')) {
    const dirName = normalizedPattern.slice(3, -3);
    return normalizedPath.includes('/' + dirName + '/');
  }

  // Pattern like **/name - match name anywhere
  if (normalizedPattern.startsWith('**/')) {
    const name = normalizedPattern.slice(3);
    return normalizedPath === name || normalizedPath.endsWith('/' + name);
  }

  // Pattern with wildcards - convert to regex
  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    const regexPattern = normalizedPattern
      .replace(/\*\*/g, '<<DOUBLESTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<DOUBLESTAR>>/g, '.*')
      .replace(/\?/g, '[^/]');

    return new RegExp('^' + regexPattern + '$').test(normalizedPath);
  }

  // Exact match
  return normalizedPath === normalizedPattern;
}

/**
 * Check if a path is in node_modules
 */
export function isInNodeModules(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('node_modules/') || normalized.endsWith('node_modules');
}

/**
 * Check if a file should be ignored based on ignore patterns
 */
export function shouldIgnore(
  filePath: string,
  patterns: string[] = [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '**/*.min.js',
    '**/*.d.ts',
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ]
): boolean {
  return matchesAnyPattern(filePath, patterns);
}

/**
 * Inline ignore markers — `// qa-agent-ignore` or `// qa-agent-ignore-line: <ruleId>`.
 * When a line contains a marker for a specific rule, that line is skipped.
 */
const INLINE_IGNORE_PATTERN = /qa-agent-ignore(?:-line)?(?::\s*([\w-]+))?/i;

export function shouldIgnoreLine(
  content: string,
  line: number,
  ruleId?: string
): boolean {
  const lines = content.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return false;
  return lineHasIgnoreMarker(lines[idx], ruleId);
}

export function shouldIgnoreSection(
  content: string,
  startLine: number,
  endLine: number,
  ruleId?: string
): boolean {
  const lines = content.split('\n');
  const lo = Math.max(0, startLine - 1);
  const hi = Math.min(lines.length - 1, endLine - 1);
  for (let i = lo; i <= hi; i++) {
    if (lineHasIgnoreMarker(lines[i], ruleId)) return true;
  }
  return false;
}

function lineHasIgnoreMarker(line: string, ruleId?: string): boolean {
  const match = line.match(INLINE_IGNORE_PATTERN);
  if (!match) return false;
  if (!ruleId) return true;
  return match[1] === ruleId;
}
