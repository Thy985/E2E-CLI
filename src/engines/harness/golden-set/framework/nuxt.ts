/**
 * Nuxt Golden Set
 *
 * 10 test cases for Nuxt framework analysis
 *
 * NOTE: Global directory-based checks (nuxt-error-missing, nuxt-pagemeta-missing)
 * are declared as falsePositives because golden cases are single-file snippets
 * without full directory structure. These checks are legitimate for real projects.
 */

import type { GoldenTestCase } from '../../types';

export const nuxtGoldenCases: GoldenTestCase[] = [
  // ─── nuxt-image-missing ───────────────────────────────────
  {
    id: 'nuxt-001',
    difficulty: 'easy',
    skill: 'nuxt',
    tags: ['image', 'optimization'],
    input: {
      filePath: 'pages/gallery.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Photo Gallery</h1>
    <img src="/images/photo1.jpg" width="800" height="600" />
    <img src="/images/photo2.jpg" />
  </div>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['nuxt-image-missing'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: '<NuxtImg',
      shouldNotExist: ['<img src'],
    },
  },

  // ─── nuxt-link-missing ──────────────────────────────────────
  {
    id: 'nuxt-002',
    difficulty: 'easy',
    skill: 'nuxt',
    tags: ['navigation', 'routing'],
    input: {
      filePath: 'pages/navigation.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </nav>
</template>`,
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['nuxt-link-missing'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: '<NuxtLink',
      shouldNotExist: ['<a href'],
    },
  },

  // ─── nuxt-dom-access ────────────────────────────────────────
  {
    id: 'nuxt-003',
    difficulty: 'medium',
    skill: 'nuxt',
    tags: ['ssr', 'dom-access'],
    input: {
      filePath: 'pages/dashboard.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Dashboard</h1>
    <p ref="statusEl">Status: {{ status }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const status = ref('loading');
const statusEl = ref<HTMLElement | null>(null);

onMounted(() => {
  if (statusEl.value) {
    statusEl.value.textContent = 'Loaded';
  }
  document.title = 'Dashboard';
});
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-dom-access'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: "import { useHead } from 'nuxt/app'",
      shouldNotExist: ['document.title'],
    },
  },

  // ─── nuxt-client-secret ─────────────────────────────────────
  {
    id: 'nuxt-004',
    difficulty: 'hard',
    skill: 'nuxt',
    tags: ['security', 'config'],
    input: {
      filePath: 'pages/admin.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Admin Panel</h1>
    <button @click="fetchData">Fetch Data</button>
  </div>
</template>

<script setup lang="ts">
const API_KEY = 'sk-1234567890abcdef';
const SECRET = 'my-super-secret-key';

const fetchData = async () => {
  const response = await fetch('https://api.example.com/data', {
    headers: {
      Authorization: 'Bearer ' + API_KEY,
    },
  });
  return response.json();
};
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['nuxt-client-secret'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: 'useRuntimeConfig()',
      shouldNotExist: ['API_KEY =', 'SECRET ='],
    },
  },

  // ─── nuxt-ssr-misuse ────────────────────────────────────────
  {
    id: 'nuxt-005',
    difficulty: 'medium',
    skill: 'nuxt',
    tags: ['ssr', 'data-fetching'],
    input: {
      filePath: 'pages/users.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Users</h1>
    <ul>
      <li v-for="user in users" :key="user.id">{{ user.name }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const users = ref([]);

onMounted(async () => {
  const response = await fetch('https://api.example.com/users');
  users.value = await response.json();
});
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-ssr-misuse'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: 'async function',
      shouldNotExist: ['onMounted('],
    },
  },

  // ─── nuxt-pagemeta-missing ──────────────────────────────────
  {
    id: 'nuxt-006',
    difficulty: 'easy',
    skill: 'nuxt',
    tags: ['seo', 'meta'],
    input: {
      filePath: 'pages/blog.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Blog</h1>
    <p>Blog posts go here</p>
  </div>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-pagemeta-missing'],
      falsePositives: ['nuxt-error-missing'],
    },
    expectedFix: {
      codePattern: 'definePageMeta',
      shouldNotExist: [],
    },
  },

  // ─── nuxt-hardcoded-url ─────────────────────────────────────
  {
    id: 'nuxt-007',
    difficulty: 'medium',
    skill: 'nuxt',
    tags: ['config', 'env'],
    input: {
      filePath: 'pages/settings.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Settings</h1>
    <button @click="saveSettings">Save</button>
  </div>
</template>

<script setup lang="ts">
const API_URL = 'http://api.example.com';

const saveSettings = async () => {
  await fetch(API_URL + '/settings', { method: 'POST' });
};
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-hardcoded-url'],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: 'useRuntimeConfig()',
      shouldNotExist: ["'http://"],
    },
  },

  // ─── nuxt-error-missing ─────────────────────────────────────
  {
    id: 'nuxt-008',
    difficulty: 'easy',
    skill: 'nuxt',
    tags: ['error-handling'],
    input: {
      filePath: 'pages/checkout.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Checkout</h1>
    <form>
      <input type="text" placeholder="Card number" />
      <input type="text" placeholder="Expiry" />
      <button type="submit">Pay Now</button>
    </form>
  </div>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-error-missing'],
      falsePositives: ['nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: 'error.vue',
      shouldNotExist: [],
    },
  },

  // ─── clean-nuxt-page ────────────────────────────────────────
  {
    id: 'nuxt-009',
    difficulty: 'easy',
    skill: 'nuxt',
    tags: ['clean', 'best-practices'],
    input: {
      filePath: 'pages/profile.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <NuxtLink to="/">Home</NuxtLink>
    <NuxtLink to="/settings">Settings</NuxtLink>
    <NuxtImg src="/avatars/user.jpg" alt="User avatar" width="200" height="200" />
    <h1>Profile</h1>
    <p>{{ user.name }}</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: 'User Profile',
  layout: 'default',
});

const user = { name: 'John Doe' };
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 0,
      issueTypes: [],
      falsePositives: ['nuxt-error-missing'],
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
  },

  // ─── multiple-issues-nuxt ───────────────────────────────────
  {
    id: 'nuxt-010',
    difficulty: 'hard',
    skill: 'nuxt',
    tags: ['multiple-issues', 'comprehensive'],
    input: {
      filePath: 'pages/store.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <a href="/">Back to Home</a>
    <h1>Store</h1>
    <img src="/store-banner.png" alt="Store banner" />
    <input type="text" v-model="query" />
    <button @click="searchProducts">Search</button>
    <a href="/cart">View Cart ({{ cart.length }})</a>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const query = ref('');
const cart = ref([]);
const API_KEY = 'sk-1234567890abcdef';

const searchProducts = async () => {
  const res = await fetch('https://api.example.com/products?search=' + query.value);
  return res.json();
};

onMounted(() => {
  document.title = 'Store';
});
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 4,
      issueTypes: [
        'nuxt-image-missing',
        'nuxt-link-missing',
        'nuxt-client-secret',
        'nuxt-ssr-misuse',
      ],
      falsePositives: ['nuxt-error-missing', 'nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: '<NuxtImg',
      shouldNotExist: ['<img src', '<a href', 'API_KEY ='],
    },
  },
];

export default nuxtGoldenCases;
