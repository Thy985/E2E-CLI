/**
 * Ignore Comment Support
 * Supports // qa-agent-ignore and // qa-agent-ignore-next-line
 */

/**
 * Check if a line should be ignored based on comments
 */
export function shouldIgnoreLine(
  content: string, 
  lineNumber: number,
  ruleId?: string
): boolean {
  const lines = content.split('\n');
  const line = lines[lineNumber - 1];
  
  if (!line) return false;
  
  // Check for inline ignore
  if (line.includes('// qa-agent-ignore')) {
    // Check if specific rule is mentioned
    if (ruleId) {
      const match = line.match(/qa-agent-ignore\s+(.+)/);
      if (match) {
        const ignoredRules = match[1].split(',').map(r => r.trim());
        return ignoredRules.includes(ruleId) || ignoredRules.includes('all');
      }
    }
    return true;
  }
  
  // Check for previous line ignore comment
  if (lineNumber > 1) {
    const prevLine = lines[lineNumber - 2];
    if (prevLine?.includes('// qa-agent-ignore-next-line')) {
      // Check if specific rule is mentioned
      if (ruleId) {
        const match = prevLine.match(/qa-agent-ignore-next-line\s+(.+)/);
        if (match) {
          const ignoredRules = match[1].split(',').map(r => r.trim());
          return ignoredRules.includes(ruleId) || ignoredRules.includes('all');
        }
      }
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a file section should be ignored
 */
export function shouldIgnoreSection(
  content: string,
  startLine: number,
  endLine: number,
  ruleId?: string
): boolean {
  const lines = content.split('\n');
  
  // Check for ignore-start comment
  let inIgnoreSection = false;
  let ignoreRules: string[] = [];
  
  for (let i = 0; i < startLine; i++) {
    const line = lines[i];
    
    if (line?.includes('// qa-agent-ignore-start')) {
      inIgnoreSection = true;
      const match = line.match(/qa-agent-ignore-start\s+(.+)/);
      if (match) {
        ignoreRules = match[1].split(',').map(r => r.trim());
      } else {
        ignoreRules = ['all'];
      }
    }
    
    if (line?.includes('// qa-agent-ignore-end')) {
      inIgnoreSection = false;
      ignoreRules = [];
    }
  }
  
  if (inIgnoreSection) {
    if (ruleId) {
      return ignoreRules.includes(ruleId) || ignoreRules.includes('all');
    }
    return true;
  }
  
  return false;
}

/**
 * Parse ignore comments from content
 */
export function parseIgnoreComments(content: string): Map<number, string[]> {
  const lines = content.split('\n');
  const ignoreMap = new Map<number, string[]>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    
    // Inline ignore
    if (line.includes('// qa-agent-ignore')) {
      const match = line.match(/qa-agent-ignore\s+(.+)/);
      if (match) {
        ignoreMap.set(lineNumber, match[1].split(',').map(r => r.trim()));
      } else {
        ignoreMap.set(lineNumber, ['all']);
      }
    }
    
    // Next line ignore
    if (line.includes('// qa-agent-ignore-next-line')) {
      const nextLineNumber = lineNumber + 1;
      const match = line.match(/qa-agent-ignore-next-line\s+(.+)/);
      if (match) {
        ignoreMap.set(nextLineNumber, match[1].split(',').map(r => r.trim()));
      } else {
        ignoreMap.set(nextLineNumber, ['all']);
      }
    }
  }
  
  return ignoreMap;
}
