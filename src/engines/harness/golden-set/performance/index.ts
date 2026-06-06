/**
 * Performance Golden Set — 10 个性能基准测试用例
 */

import type { GoldenTestCase } from '../../types';

export const performanceGoldenCases: GoldenTestCase[] = [
  // ---------------------------------------------------------------------------
  // Case 1: 内联脚本阻塞渲染（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-inline-script-001',
    skill: 'performance',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>My Page</title>
  <script src="app.js"></script>
  <script src="analytics.js"></script>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`,
      filePath: 'index.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['render-blocking-resource'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'defer',
      shouldNotExist: ['<script src="app.js"></script>'],
    },
    difficulty: 'easy',
    tags: ['render-blocking', 'scripts'],
  },

  // ---------------------------------------------------------------------------
  // Case 2: 缺失图片尺寸（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-missing-dimensions-002',
    skill: 'performance',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<body>
  <div class="hero">
    <img src="hero.jpg" alt="Hero">
    <img src="logo.svg" alt="Logo" width="120" height="40">
  </div>
  <main>
    <img src="content.png" alt="Content">
  </main>
</body>
</html>`,
      filePath: 'page.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['img-dimensions'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'width=',
      shouldNotExist: ['<img src="hero.jpg"'],
    },
    difficulty: 'easy',
    tags: ['cls', 'images'],
  },

  // ---------------------------------------------------------------------------
  // Case 3: console.log 生产残留（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-console-log-003',
    skill: 'performance',
    input: {
      code: `export function processOrder(order: Order) {
  console.log('Processing order:', order);
  
  const total = order.items.reduce((sum, item) => {
    console.log('Adding item price:', item.price);
    return sum + item.price;
  }, 0);
  
  console.log('Order total:', total);
  return { ...order, total };
}`,
      filePath: 'src/orders/process.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['console-statement'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'if (process.env.NODE_ENV',
      shouldNotExist: ["console.log("],
    },
    difficulty: 'easy',
    tags: ['debug', 'console'],
  },

  // ---------------------------------------------------------------------------
  // Case 4: 同步 XMLHttpRequest（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-sync-xhr-004',
    skill: 'performance',
    input: {
      code: `function loadData() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/data', false);
  xhr.send();
  return JSON.parse(xhr.responseText);
}

export { loadData };`,
      filePath: 'src/api/legacy.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['sync-xhr'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'true)',
      shouldNotExist: [", false)"],
    },
    difficulty: 'easy',
    tags: ['blocking', 'xhr'],
  },

  // ---------------------------------------------------------------------------
  // Case 5: 缺失 viewport meta（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-missing-viewport-005',
    skill: 'performance',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Mobile Page</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`,
      filePath: 'mobile.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['viewport'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'viewport',
      shouldNotExist: ['<meta charset="UTF-8">'],
    },
    difficulty: 'easy',
    tags: ['mobile', 'viewport'],
  },

  // ---------------------------------------------------------------------------
  // Case 6: 大体积内联样式（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-inline-style-006',
    skill: 'performance',
    input: {
      code: `<div style="width: 100%; max-width: 1200px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333;">
  <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 16px;">Title</h1>
  <p style="font-size: 18px; color: #666;">Description text here.</p>
  <button style="padding: 12px 24px; background-color: #007bff; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer;">
    Click Me
  </button>
</div>`,
      filePath: 'component.html',
      stack: ['html', 'css'],
    },
    expectedDiagnosis: {
      issueCount: 4,
      issueTypes: ['inline-style'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'class=',
      shouldNotExist: ['style="width: 100%'],
    },
    difficulty: 'medium',
    tags: ['css', 'inline-styles'],
  },

  // ---------------------------------------------------------------------------
  // Case 7: 同步循环中的 DOM 操作（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-dom-loop-007',
    skill: 'performance',
    input: {
      code: `function renderList(items: string[]) {
  const list = document.getElementById('list')!;
  
  for (let i = 0; i < items.length; i++) {
    const li = document.createElement('li');
    li.textContent = items[i];
    list.appendChild(li);
  }
}

export { renderList };`,
      filePath: 'src/dom/list.ts',
      stack: ['typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['dom-manipulation-perf'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'DocumentFragment',
      shouldNotExist: ['list.appendChild(li)'],
    },
    difficulty: 'medium',
    tags: ['dom', 'loop'],
  },

  // ---------------------------------------------------------------------------
  // Case 8: 未使用第三方库导入（中等）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-unused-import-008',
    skill: 'performance',
    input: {
      code: `import React from 'react';
import _ from 'lodash';
import moment from 'moment';
import { useState, useEffect } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);
  
  return <div>{count}</div>;
}

export default MyComponent;`,
      filePath: 'src/components/MyComponent.tsx',
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['unused-import'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: ["import _ from 'lodash'", "import moment from 'moment'"],
    },
    difficulty: 'medium',
    tags: ['bundle-size', 'dead-code'],
  },

  // ---------------------------------------------------------------------------
  // Case 9: 同步阻塞脚本 + 无 preconnect（困难）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-blocking-resources-009',
    skill: 'performance',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdn.example.com/analytics.js"></script>
  <script src="app.js"></script>
</head>
<body>
  <img src="https://images.example.com/hero.jpg" alt="Hero">
  <main>
    <h1>Welcome</h1>
    <p>Content here.</p>
  </main>
</body>
</html>`,
      filePath: 'index.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['render-blocking-resource', 'preconnect', 'preload-critical'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'preconnect',
      shouldNotExist: ['<script src="app.js"></script>', 'https://fonts.googleapis.com'],
    },
    difficulty: 'hard',
    tags: ['render-blocking', 'preconnect', 'cdn'],
  },

  // ---------------------------------------------------------------------------
  // Case 10: 性能反模式大杂烩（困难）
  // ---------------------------------------------------------------------------
  {
    id: 'perf-anti-patterns-010',
    skill: 'performance',
    input: {
      code: `import React from 'react';
import debounce from 'lodash/debounce';

function SearchResults({ query }: { query: string }) {
  const [results, setResults] = React.useState([]);
  
  React.useEffect(() => {
    console.log('Fetching results for:', query);
    
    fetch('/api/search?q=' + query)
      .then(res => res.json())
      .then(data => {
        console.log('Got', data.length, 'results');
        setResults(data);
      });
  }, [query]);
  
  return (
    <div style={{ padding: '20px', margin: '0 auto', maxWidth: '800px' }}>
      {results.map((item: any) => (
        <div key={item.id} style={{ borderBottom: '1px solid #eee', padding: '12px 0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{item.title}</h3>
          <p style={{ color: '#666' }}>{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export default SearchResults;`,
      filePath: 'src/components/SearchResults.tsx',
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 5,
      issueTypes: ['console-statement', 'inline-style', 'unused-import'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: ['console.log', 'style={{'],
    },
    difficulty: 'hard',
    tags: ['react', 'console', 'inline-style', 'dead-code'],
  },
];

export default performanceGoldenCases;
