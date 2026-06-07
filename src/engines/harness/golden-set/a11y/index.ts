/**
 * A11y Golden Set — 10 个可访问性基准测试用例
 */

import type { GoldenTestCase } from '../../types';

export const a11yGoldenCases: GoldenTestCase[] = [
  // ---------------------------------------------------------------------------
  // Case 1: 缺失 img alt 属性（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-missing-alt-001',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<body>
  <img src="hero.png">
  <img src="logo.svg" alt="Company Logo">
  <div class="gallery">
    <img src="photo1.jpg">
    <img src="photo2.jpg" alt="">
  </div>
</body>
</html>`,
      filePath: 'index.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['img-alt'],
      falsePositives: ['button-name', 'label'],
    },
    expectedFix: {
      codePattern: 'alt=',
      shouldNotExist: ['<img src="hero.png">'],
    },
    difficulty: 'easy',
    tags: ['images', 'wcag-1.1.1'],
  },

  // ---------------------------------------------------------------------------
  // Case 2: 空按钮（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-empty-button-002',
    skill: 'a11y',
    input: {
      code: `<div class="toolbar">
  <button>Save</button>
  <button></button>
  <button class="icon-btn"></button>
  <button aria-label="Close">×</button>
  <input type="submit" value="Submit">
</div>`,
      filePath: 'toolbar.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['button-name'],
      falsePositives: ['img-alt'],
    },
    expectedFix: {
      codePattern: 'aria-label=',
      shouldNotExist: ['<button></button>', '<button class="icon-btn"></button>'],
    },
    difficulty: 'easy',
    tags: ['buttons', 'wcag-4.1.2'],
  },

  // ---------------------------------------------------------------------------
  // Case 3: 表单 input 缺失 label（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-missing-label-003',
    skill: 'a11y',
    input: {
      code: `<form>
  <input type="text" placeholder="Enter name">
  <input type="email" id="email" aria-label="Email address">
  <textarea placeholder="Comment"></textarea>
  <select>
    <option>Choose option</option>
  </select>
  <input type="submit" value="Send">
</form>`,
      filePath: 'form.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['label'],
      falsePositives: ['img-alt', 'button-name'],
    },
    expectedFix: {
      codePattern: 'id=',
      shouldNotExist: ['placeholder="Enter name"', 'placeholder="Comment"'],
    },
    difficulty: 'easy',
    tags: ['forms', 'wcag-1.3.1'],
  },

  // ---------------------------------------------------------------------------
  // Case 4: 缺失 lang 属性（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-missing-lang-004',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html>
<head><title>Welcome</title></head>
<body>
  <h1>Welcome to our site</h1>
  <p>This is English content.</p>
</body>
</html>`,
      filePath: 'page.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['html-has-lang'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'lang="',
      shouldNotExist: ['<html>'],
    },
    difficulty: 'easy',
    tags: ['language', 'wcag-3.1.1'],
  },

  // ---------------------------------------------------------------------------
  // Case 5: 空链接（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-empty-link-005',
    skill: 'a11y',
    input: {
      code: `<nav>
  <a href="/home">Home</a>
  <a href="/about"></a>
  <a href="/contact" class="icon-link"></a>
  <a href="/docs" aria-label="Documentation">Docs</a>
</nav>`,
      filePath: 'nav.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['link-name'],
      falsePositives: ['button-name'],
    },
    expectedFix: {
      codePattern: 'aria-label=',
      shouldNotExist: ['<a href="/about"></a>'],
    },
    difficulty: 'easy',
    tags: ['links', 'wcag-2.4.4'],
  },

  // ---------------------------------------------------------------------------
  // Case 6: 缺失页面标题（基础）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-missing-title-006',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<head></head>
<body>
  <h1>Main Content</h1>
</body>
</html>`,
      filePath: 'notitle.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['document-title'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: '<title>',
      shouldNotExist: ['<head></head>'],
    },
    difficulty: 'easy',
    tags: ['page-title', 'wcag-2.4.2'],
  },

  // ---------------------------------------------------------------------------
  // Case 7: 多个问题混合（中等难度）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-mixed-007',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html>
<head></head>
<body>
  <header>
    <nav>
      <a href="/"></a>
      <button></button>
    </nav>
  </header>
  <main>
    <img src="banner.jpg">
    <form>
      <input type="search" placeholder="Search...">
    </form>
  </main>
</body>
</html>`,
      filePath: 'messy.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 6,
      issueTypes: ['html-has-lang', 'document-title', 'link-name', 'button-name', 'img-alt', 'label'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'lang=',
      shouldNotExist: ['<html>', '<head></head>', '<a href="/"></a>', '<button></button>'],
    },
    difficulty: 'medium',
    tags: ['mixed', 'wcag-multiple'],
  },

  // ---------------------------------------------------------------------------
  // Case 8: JSX 组件中的 a11y 问题（中等难度）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-jsx-008',
    skill: 'a11y',
    input: {
      code: `import React from 'react';

export function ProductCard({ product }: { product: { name: string; image: string } }) {
  return (
    <div className="card">
      <img src={product.image} />
      <h3>{product.name}</h3>
      <button onClick={() => console.log('add to cart')}>
        🛒
      </button>
      <a href={'/product/' + product.id} className="link"></a>
    </div>
  );
}`,
      filePath: 'ProductCard.tsx',
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['img-alt', 'link-name'],
      falsePositives: ['button-name'],
    },
    expectedFix: {
      codePattern: 'alt={',
      shouldNotExist: ['<img src={product.image} />'],
    },
    difficulty: 'medium',
    tags: ['jsx', 'react', 'components'],
  },

  // ---------------------------------------------------------------------------
  // Case 9: 缺失 heading 层级（中等难度）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-heading-level-009',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Main Title</h1>
  <p>Some intro text.</p>
  <h3>Section Title</h3>
  <p>Content under section.</p>
  <h5>Subsection</h5>
  <p>Deep content.</p>
</body>
</html>`,
      filePath: 'headings.html',
      stack: ['html'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['heading-order'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: '<h2>',
      shouldNotExist: ['<h3>Section Title</h3>'],
    },
    difficulty: 'medium',
    tags: ['headings', 'wcag-1.3.1'],
  },

  // ---------------------------------------------------------------------------
  // Case 10: 色彩对比度问题（困难）
  // ---------------------------------------------------------------------------
  {
    id: 'a11y-contrast-010',
    skill: 'a11y',
    input: {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
<style>
  .light-text { color: #cccccc; background-color: #ffffff; }
  .dark-text { color: #333333; background-color: #ffffff; }
  .yellow-on-white { color: #ffff00; background-color: #ffffff; }
  .good-contrast { color: #000000; background-color: #ffffff; }
</style>
</head>
<body>
  <p class="light-text">This text is hard to read</p>
  <p class="dark-text">This text is readable</p>
  <p class="yellow-on-white">This is very hard to read</p>
  <p class="good-contrast">This is perfectly readable</p>
</body>
</html>`,
      filePath: 'contrast.html',
      stack: ['html', 'css'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['color-contrast'],
      falsePositives: [],
    },
    expectedFix: {
      codePattern: 'color-contrast',
      shouldNotExist: ['color: #cccccc'],
    },
    difficulty: 'hard',
    tags: ['color', 'wcag-1.4.3', 'css'],
  },
];

export default a11yGoldenCases;
