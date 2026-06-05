/**
 * Ignore comment support
 *
 * 三个公开 API 共享一个内部 `IgnoreIndex`，对内容做单次扫描后所有
 * 查询都是 O(1)。`shouldIgnoreLine` / `shouldIgnoreSection` 是
 * `parseIgnoreComments` 之上 O(1) 的便利包装。
 *
 * 语法：
 *   // qa-agent-ignore               忽略本行（对所有 rule）
 *   // qa-agent-ignore rule-a,b     只忽略指定 rule
 *   // qa-agent-ignore-next-line     忽略紧跟的下一行
 *   // qa-agent-ignore-start         开始一段忽略
 *   // qa-agent-ignore-end           结束一段忽略
 */

interface IgnoreIndex {
  /** 某一行是否被忽略（含 'all' 或 ruleId） */
  perLine: Map<number, string[]>;
  /** 哪些行落在 [ignore-start, ignore-end] 区间内 */
  sectionRanges: Array<{ start: number; end: number; rules: string[] }>;
}

function rulesOf(line: string, marker: string): string[] {
  const match = line.match(new RegExp(`${marker}\\s+(.+)`));
  return match ? match[1].split(',').map((r) => r.trim()) : ['all'];
}

function buildIndex(content: string): IgnoreIndex {
  const lines = content.split('\n');
  const perLine = new Map<number, string[]>();
  const sectionRanges: IgnoreIndex['sectionRanges'] = [];
  let sectionStart: { line: number; rules: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNumber = i + 1;

    if (line.includes('// qa-agent-ignore')) {
      perLine.set(lineNumber, rulesOf(line, 'qa-agent-ignore'));
    }
    if (line.includes('// qa-agent-ignore-next-line')) {
      perLine.set(lineNumber + 1, rulesOf(line, 'qa-agent-ignore-next-line'));
    }

    if (line.includes('// qa-agent-ignore-start')) {
      sectionStart = { line: lineNumber, rules: rulesOf(line, 'qa-agent-ignore-start') };
    } else if (line.includes('// qa-agent-ignore-end') && sectionStart) {
      sectionRanges.push({
        start: sectionStart.line,
        end: lineNumber,
        rules: sectionStart.rules,
      });
      sectionStart = null;
    }
  }
  // 未闭合的 section：到文件末尾
  if (sectionStart) {
    sectionRanges.push({
      start: sectionStart.line,
      end: lines.length,
      rules: sectionStart.rules,
    });
  }

  return { perLine, sectionRanges };
}

function matches(rules: string[] | undefined, ruleId?: string): boolean {
  if (!rules) return false;
  if (!ruleId) return true;
  return rules.includes(ruleId) || rules.includes('all');
}

/**
 * 单次扫描 content，返回 忽略规则表。
 * 后续 shouldIgnoreLine / shouldIgnoreSection 都基于这张表。
 */
export function parseIgnoreComments(content: string): Map<number, string[]> {
  return buildIndex(content).perLine;
}

/**
 * O(1) 查询某行是否被忽略
 */
export function shouldIgnoreLine(
  content: string,
  lineNumber: number,
  ruleId?: string
): boolean {
  const index = buildIndex(content);
  return matches(index.perLine.get(lineNumber), ruleId);
}

/**
 * O(1) 查询某行是否落在任何 ignore-start..end 区间内
 */
export function shouldIgnoreSection(
  content: string,
  startLine: number,
  endLine: number,
  ruleId?: string
): boolean {
  const index = buildIndex(content);
  for (const range of index.sectionRanges) {
    if (range.end < startLine) continue;
    if (range.start > endLine) break;
    if (range.start <= endLine && range.end >= startLine) {
      return matches(range.rules, ruleId);
    }
  }
  return false;
}

/**
 * 复合查询：行级 + 段级，一次 O(1) 索引构建
 */
export function isLineIgnored(
  content: string,
  lineNumber: number,
  ruleId?: string
): boolean {
  const index = buildIndex(content);
  if (matches(index.perLine.get(lineNumber), ruleId)) return true;
  for (const range of index.sectionRanges) {
    if (range.start <= lineNumber && lineNumber <= range.end) {
      if (matches(range.rules, ruleId)) return true;
    }
  }
  return false;
}
