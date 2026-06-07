/**
 * Next.js Golden Set
 *
 * 10 test cases for Next.js framework analysis
 */

import type { GoldenTestCase } from '../../types';

export const nextjsGoldenCases: GoldenTestCase[] = [
  // ─── next-image-missing ─────────────────────────────────────
  {
    id: 'nextjs-001',
    difficulty: 'easy',
    skill: 'nextjs',
    description: 'Page using <img> instead of <Image>',
    input: {
      filePath: 'src/app/gallery/page.tsx',
      code: `import React from 'react';

export default function GalleryPage() {
  return (
    <div>
      <h1>Photo Gallery</h1>
      <img src="/images/photo1.jpg" width="800" height="600" />
      <img src="/images/photo2.jpg" />
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['next-image-missing'],
    },
    expectedFix: {
      codePattern: "Image from 'next/image'",
      shouldNotExist: ['<img'],
    },
    tags: ['image-optimization'],
  },

  // ─── next-link-missing ──────────────────────────────────────
  {
    id: 'nextjs-002',
    difficulty: 'easy',
    skill: 'nextjs',
    description: 'Page using <a href> instead of <Link href>',
    input: {
      filePath: 'src/app/navigation.tsx',
      code: `import React from 'react';

export default function Navigation() {
  return (
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['next-link-missing'],
    },
    expectedFix: {
      codePattern: "Link from 'next/link'",
      shouldNotExist: ['<a href'],
    },
    tags: ['navigation'],
  },

  // ─── next-server-client-misuse ──────────────────────────────
  {
    id: 'nextjs-003',
    difficulty: 'hard',
    skill: 'nextjs',
    description: 'App router page with useState but no "use client" directive',
    input: {
      filePath: 'src/app/dashboard/page.tsx',
      code: `import React, { useState } from 'react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div>
      <h1>Dashboard</h1>
      <button onClick={() => setActiveTab('overview')}>Overview</button>
      <button onClick={() => setActiveTab('analytics')}>Analytics</button>
      {activeTab === 'overview' && <p>Overview content</p>}
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['next-server-client-misuse'],
    },
    expectedFix: {
      codePattern: "'use client'",
      shouldNotExist: [],
    },
    tags: ['server-client'],
  },

  // ─── next-metadata-missing ──────────────────────────────────
  {
    id: 'nextjs-004',
    difficulty: 'medium',
    skill: 'nextjs',
    description: 'Layout file without export const metadata',
    input: {
      filePath: 'src/app/layout.tsx',
      code: `import React from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header>My App</header>
        {children}
        <footer>© 2024</footer>
      </body>
    </html>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['next-metadata-missing'],
    },
    expectedFix: {
      codePattern: 'export const metadata',
      shouldNotExist: [],
    },
    tags: ['metadata', 'seo'],
  },

  // ─── next-api-client-misuse ─────────────────────────────────
  {
    id: 'nextjs-005',
    difficulty: 'medium',
    skill: 'nextjs',
    description: 'Client component with direct fetch calls instead of Server Actions',
    input: {
      filePath: 'src/app/users/page.tsx',
      code: `'use client';

import React, { useEffect, useState } from 'react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data));
  }, []);

  const deleteUser = async (id: string) => {
    await fetch('/api/users/' + id, { method: 'DELETE' });
  };

  return (
    <div>
      <h1>Users</h1>
      {users.map((user: any) => (
        <div key={user.id}>
          <span>{user.name}</span>
          <button onClick={() => deleteUser(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['next-api-client-misuse'],
    },
    expectedFix: {
      codePattern: 'async function',
      shouldNotExist: ['fetch('],
    },
    tags: ['server-actions', 'data-fetching'],
  },

  // ─── next-loading-missing ───────────────────────────────────
  {
    id: 'nextjs-006',
    difficulty: 'easy',
    skill: 'nextjs',
    description: 'Dynamic route without loading.tsx sibling',
    input: {
      filePath: 'src/app/products/[id]/page.tsx',
      code: `export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetch('https://api.example.com/products/' + id);
  const product = await res.json();

  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <p>{product.price}</p>
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['next-loading-missing'],
    },
    expectedFix: {
      codePattern: 'loading.tsx',
      shouldNotExist: [],
    },
    tags: ['loading-state'],
  },

  // ─── next-error-missing ─────────────────────────────────────
  {
    id: 'nextjs-007',
    difficulty: 'easy',
    skill: 'nextjs',
    description: 'Route without error.tsx boundary',
    input: {
      filePath: 'src/app/checkout/page.tsx',
      code: `import React from 'react';

export default function CheckoutPage() {
  return (
    <div>
      <h1>Checkout</h1>
      <form>
        <input type="text" placeholder="Card number" />
        <input type="text" placeholder="Expiry" />
        <button type="submit">Pay Now</button>
      </form>
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['next-error-missing'],
    },
    expectedFix: {
      codePattern: 'error.tsx',
      shouldNotExist: [],
    },
    tags: ['error-boundary'],
  },

  // ─── next-config-missing ────────────────────────────────────
  {
    id: 'nextjs-008',
    difficulty: 'medium',
    skill: 'nextjs',
    description: 'Project without next.config.js optimization',
    input: {
      filePath: 'src/app/blog/page.tsx',
      code: `export default async function BlogPage() {
  const res = await fetch('https://cms.example.com/posts');
  const posts = await res.json();

  return (
    <main>
      <h1>Blog</h1>
      {posts.map((post: any) => (
        <article key={post.slug}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </main>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['next-config-missing'],
    },
    expectedFix: {
      codePattern: 'next.config',
      shouldNotExist: [],
    },
    tags: ['configuration'],
  },

  // ─── clean-nextjs-page ──────────────────────────────────────
  {
    id: 'nextjs-009',
    difficulty: 'easy',
    skill: 'nextjs',
    description:
      'Well-written Next.js app router page with Image, Link, metadata, and proper "use client" usage',
    input: {
      filePath: 'src/app/profile/page.tsx',
      code: `import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Profile',
  description: 'View and edit your user profile',
};

export default function ProfilePage() {
  return (
    <main>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/settings">Settings</Link>
      </nav>
      <h1>Profile</h1>
      <Image
        src="/avatars/user.jpg"
        alt="User avatar"
        width={200}
        height={200}
        priority
      />
      <p>Welcome to your profile page.</p>
    </main>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 0,
      issueTypes: [],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
    tags: ['clean'],
  },

  // ─── multiple-issues-nextjs ─────────────────────────────────
  {
    id: 'nextjs-010',
    difficulty: 'hard',
    skill: 'nextjs',
    description:
      'Page with multiple issues: img without Image, link without Link, and server-client misuse',
    input: {
      filePath: 'src/app/store/page.tsx',
      code: `import React, { useState } from 'react';

export default function StorePage() {
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');

  const searchProducts = async () => {
    const res = await fetch('/api/products?search=' + query);
    return res.json();
  };

  return (
    <div>
      <a href="/">Back to Home</a>
      <h1>Store</h1>
      <img src="/store-banner.png" alt="Store banner" />
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <button onClick={searchProducts}>Search</button>
      <a href="/cart">View Cart ({cart.length})</a>
    </div>
  );
}`,
      stack: ['react', 'typescript'],
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: [
        'next-image-missing',
        'next-link-missing',
        'next-server-client-misuse',
      ],
    },
    expectedFix: {
      codePattern: "Image from 'next/image'",
      shouldNotExist: ['<img', '<a href'],
    },
    tags: ['multiple-issues'],
  },
];

export default nextjsGoldenCases;
