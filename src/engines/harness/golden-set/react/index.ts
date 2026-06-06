/**
 * React Golden Set
 *
 * 10 test cases for React component analysis
 */

import type { GoldenTestCase } from '../../types';

export const reactGoldenCases: GoldenTestCase[] = [
  // ─── Missing Key Prop ───────────────────────────────────────
  {
    id: 'react-missing-key-001',
    difficulty: 'easy',
    skill: 'react',
    description: 'List rendering without key prop',
    input: {
      filePath: 'src/components/UserList.tsx',
      code: `import React from 'react';

export function UserList({ users }) {
  return (
    <ul>
      {users.map(user => (
        <li>{user.name}</li>
      ))}
    </ul>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['missing-key-prop'],
      falsePositives: ['unused-prop'],
    },
    expectedFix: {
      codePattern: 'key={index}',
      shouldNotExist: [],
    },
  },

  // ─── Hook Misuse ───────────────────────────────────────────
  {
    id: 'react-hook-misuse-001',
    difficulty: 'medium',
    skill: 'react',
    description: 'useState called inside conditional',
    input: {
      filePath: 'src/components/ConditionalHook.tsx',
      code: `import React, { useState, useEffect } from 'react';

export function ConditionalHook({ showExtra }) {
  const [count, setCount] = useState(0);
  
  if (showExtra) {
    const [extra, setExtra] = useState('');
  }
  
  return <div>{count}</div>;
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['hook-misuse'],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── Unused Props ─────────────────────────────────────────
  {
    id: 'react-unused-prop-001',
    difficulty: 'easy',
    skill: 'react',
    description: 'Component has unused prop',
    input: {
      filePath: 'src/components/UserCard.tsx',
      code: `import React from 'react';

export function UserCard({ name, email, unusedProp, onClick }) {
  return (
    <div onClick={onClick}>
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['unused-prop'],
    },
    expectedFix: {
      codePattern: '{ name, email, onClick }',
      shouldNotExist: ['unusedProp'],
    },
  },

  // ─── dangerouslySetInnerHTML ───────────────────────────────
  {
    id: 'react-xss-001',
    difficulty: 'medium',
    skill: 'react',
    description: 'Using dangerouslySetInnerHTML',
    input: {
      filePath: 'src/components/RichText.tsx',
      code: `import React from 'react';

export function RichText({ content }) {
  return (
    <div dangerouslySetInnerHTML={{ __html: content }} />
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['dangerous-set-inner-html'],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── img without alt ───────────────────────────────────────
  {
    id: 'react-img-alt-001',
    difficulty: 'easy',
    skill: 'react',
    description: 'img element without alt attribute in JSX',
    input: {
      filePath: 'src/components/HeroImage.tsx',
      code: `import React from 'react';

export function HeroImage() {
  return (
    <div className="hero">
      <img src="/hero.jpg" />
    </div>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['img-without-alt'],
    },
    expectedFix: {
      codePattern: 'alt=',
      shouldNotExist: [],
    },
  },

  // ─── Anchor without accessible name ────────────────────────
  {
    id: 'react-anchor-name-001',
    difficulty: 'easy',
    skill: 'react',
    description: 'Empty anchor without accessible name',
    input: {
      filePath: 'src/components/SocialLink.tsx',
      code: `import React from 'react';

export function SocialLink({ href }) {
  return (
    <a href={href}></a>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['anchor-without-name'],
    },
    expectedFix: {
      codePattern: 'aria-label=',
      shouldNotExist: [],
    },
  },

  // ─── Index as key ─────────────────────────────────────────
  {
    id: 'react-index-key-001',
    difficulty: 'medium',
    skill: 'react',
    description: 'Using index as key in list rendering',
    input: {
      filePath: 'src/components/ItemList.tsx',
      code: `import React from 'react';

export function ItemList({ items }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item.name}</li>
      ))}
    </ul>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['index-as-key'],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── Multiple issues ──────────────────────────────────────
  {
    id: 'react-multi-001',
    difficulty: 'hard',
    skill: 'react',
    description: 'Multiple React issues in one component',
    input: {
      filePath: 'src/components/BadComponent.tsx',
      code: `import React, { useState, useEffect } from 'react';

export function BadComponent({ items, title, unusedData, onHover }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    const [detail, setDetail] = useState('');
  }

  return (
    <div>
      <h2>{title}</h2>
      <img src="/banner.png" />
      {items.map((item, index) => (
        <span key={index}>{item.name}</span>
      ))}
      <a href="https://example.com"></a>
    </div>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 5,
      issueTypes: ['hook-misuse', 'unused-prop', 'img-without-alt', 'index-as-key', 'anchor-without-name'],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── Clean component (no issues) ──────────────────────────
  {
    id: 'react-clean-001',
    difficulty: 'easy',
    skill: 'react',
    description: 'Well-written React component with no issues',
    input: {
      filePath: 'src/components/GoodComponent.tsx',
      code: `import React, { useState, useCallback } from 'react';

interface Props {
  users: Array<{ id: string; name: string }>;
  onSelect: (id: string) => void;
}

export function GoodComponent({ users, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Search users"
      />
      <ul>
        {filtered.map(user => (
          <li key={user.id}>
            <button onClick={() => onSelect(user.id)}>
              {user.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 0,
      issueTypes: [],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── Nested map without key ───────────────────────────────
  {
    id: 'react-nested-map-001',
    difficulty: 'hard',
    skill: 'react',
    description: 'Nested map rendering without keys',
    input: {
      filePath: 'src/components/NestedList.tsx',
      code: `import React from 'react';

export function NestedList({ categories }) {
  return (
    <div>
      {categories.map(category => (
        <div>
          <h3>{category.name}</h3>
          {category.items.map(item => (
            <p>{item.text}</p>
          ))}
        </div>
      ))}
    </div>
  );
}`,
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['missing-key-prop'],
    },
    expectedFix: {
      codePattern: 'key={index}',
      shouldNotExist: [],
    },
  },
];

export default reactGoldenCases;
