/**
 * Performance Fix Generator
 * 
 * 自动生成性能优化修复代码
 */

import * as fs from 'fs';
import { Diagnosis, Fix } from '../../../../types';

export class PerformanceFixGenerator {
  async generateFix(diagnosis: Diagnosis, projectPath: string): Promise<Fix> {
    const { type } = diagnosis.metadata || {};
    const file = diagnosis.location.file;
    const fullPath = `${projectPath}/${file}`;

    switch (type) {
      case 'render-blocking':
        return this.fixRenderBlocking(fullPath, diagnosis);
      
      case 'css-in-body':
        return this.fixCSSInBody(fullPath, diagnosis);
      
      case 'dom-in-loop':
        return this.fixDOMInLoop(fullPath, diagnosis);
      
      case 'function-in-loop':
        return this.fixFunctionInLoop(fullPath, diagnosis);
      
      case 'event-listener-leak':
        return this.fixEventListenerLeak(fullPath, diagnosis);
      
      case 'timer-leak':
        return this.fixTimerLeak(fullPath, diagnosis);
      
      default:
        throw new Error(`Unsupported fix type: ${type}`);
    }
  }

  private fixRenderBlocking(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 添加 async 或 defer
    let fixedLine = line;
    if (!/async|defer/.test(line)) {
      fixedLine = line.replace(/<script/i, '<script defer');
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add defer attribute to script to prevent render blocking',
      riskLevel: 'low',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: line,
          content: fixedLine,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private fixCSSInBody(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Move CSS link to head section (manual review needed)',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `<!-- TODO: Move this to <head>: ${line.trim()} -->`,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
      notes: 'CSS should be loaded in <head> to prevent render blocking',
    };
  }

  private fixDOMInLoop(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // 找到循环开始和结束
    const startLine = (diagnosis.location.line || 1) - 1;
    let endLine = startLine;
    let braceCount = 0;
    let inLoop = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (/for\s*\(|while\s*\(/.test(line)) {
        inLoop = true;
      }
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      if (inLoop && braceCount === 0) {
        endLine = i;
        break;
      }
    }

    // 提取 DOM 操作
    const loopContent = lines.slice(startLine, endLine + 1).join('\n');
    const domMatch = loopContent.match(/(document\.[a-zA-Z]+\([^)]+\))/);
    
    if (!domMatch) {
      throw new Error('Could not find DOM operation to fix');
    }

    const domOperation = domMatch[1];
    const cacheVar = 'element';

    // 构建修复后的代码
    const fixedLines = [
      `// Cache DOM element outside loop`,
      `const ${cacheVar} = ${domOperation};`,
      ...lines.slice(startLine, endLine + 1).map(l => 
        l.replace(domOperation, cacheVar)
      ),
    ];

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Cache DOM element outside loop',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'replace',
          oldContent: lines.slice(startLine, endLine + 1).join('\n'),
          content: fixedLines.join('\n'),
          position: { line: startLine + 1 },
        },
      ],
    };
  }

  private fixFunctionInLoop(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 简单情况：将箭头函数提取到循环外
    const arrowMatch = line.match(/const\s+(\w+)\s*=\s*(\([^)]*\)\s*=>)/);
    if (arrowMatch) {
      const funcName = arrowMatch[1];
      const funcDef = line.trim();
      
      return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
        description: 'Move function definition outside loop',
        riskLevel: 'medium',
        changes: [
          {
            file: filePath,
            type: 'replace',
            oldContent: line,
            content: `// ${funcName} defined outside loop`,
            position: { line: diagnosis.location.line || 0 },
          },
        ],
        notes: `Move this function outside the loop: ${funcDef}`,
      };
    }

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Review function creation in loop',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: `// TODO: Move function definition outside loop`,
          position: { line: diagnosis.location.line || 0 },
        },
      ],
    };
  }

  private fixEventListenerLeak(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 提取事件监听器信息
    const match = line.match(/(\w+)\.addEventListener\(['"](\w+)['"]/);
    if (!match) {
      throw new Error('Could not parse event listener');
    }

    const element = match[1];
    const event = match[2];
    const handlerName = `${event}Handler`;

    // 在文件末尾添加清理代码
    const cleanupCode = `
// Cleanup event listener to prevent memory leak
// Add this to your cleanup/unmount function:
// ${element}.removeEventListener('${event}', ${handlerName});`;

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add event listener cleanup',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: cleanupCode,
          position: { line: lines.length },
        },
      ],
    };
  }

  private fixTimerLeak(filePath: string, diagnosis: Diagnosis): Fix {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const line = lines[(diagnosis.location.line || 1) - 1];
    
    // 提取定时器变量名
    const match = line.match(/(const|let|var)\s+(\w+)\s*=\s*(setInterval|setTimeout)/);
    const timerVar = match ? match[2] : 'timer';
    const timerType = match ? match[3] : 'setInterval';
    const clearType = timerType === 'setInterval' ? 'clearInterval' : 'clearTimeout';

    // 在文件末尾添加清理代码
    const cleanupCode = `
// Cleanup timer to prevent memory leak
// Add this to your cleanup/unmount function:
// ${clearType}(${timerVar});`;

    return {
      id: `fix-${diagnosis.id}`,
      diagnosisId: diagnosis.id,
      autoApplicable: true,
      description: 'Add timer cleanup',
      riskLevel: 'medium',
      changes: [
        {
          file: filePath,
          type: 'insert',
          content: cleanupCode,
          position: { line: lines.length },
        },
      ],
    };
  }
}

export default PerformanceFixGenerator;
