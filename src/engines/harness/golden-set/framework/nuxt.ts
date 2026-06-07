/**
 * Nuxt Golden Set
 *
 * 10 test cases for Nuxt framework analysis
 */

import type { GoldenTestCase } from '../../types';

export const nuxtGoldenCases: GoldenTestCase[] = [
  // ─── nuxt-image-missing ───────────────────────────────────
  {
    id: 'nuxt-001',
    difficulty: 'easy',
    skill: 'nuxt',
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
    },
    expectedFix: {
      codePattern: '<NuxtImg',
      shouldNotExist: ['<img'],
    },
    tags: ['image-optimization'],
  },

  // ─── nuxt-link-missing ────────────────────────────────────
  {
    id: 'nuxt-002',
    difficulty: 'easy',
    skill: 'nuxt',
    input: {
      filePath: 'components/AppNavigation.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </nav>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['nuxt-link-missing'],
    },
    expectedFix: {
      codePattern: '<NuxtLink',
      shouldNotExist: ['<a href'],
    },
    tags: ['navigation'],
  },

  // ─── nuxt-dom-access ──────────────────────────────────────
  {
    id: 'nuxt-003',
    difficulty: 'medium',
    skill: 'nuxt',
    input: {
      filePath: 'components/DomManipulator.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div class="container">
    <p id="output"></p>
    <button @click="update">Update</button>
  </div>
</template>

<script setup lang="ts">
function update() {
  const el = document.querySelector('#output')
  if (el) {
    el.innerHTML = 'Updated by DOM'
  }
}
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-dom-access'],
    },
    expectedFix: {
      codePattern: 'onMounted',
      shouldNotExist: ['document.querySelector'],
    },
    tags: ['dom', 'ssr'],
  },

  // ─── nuxt-client-secret ───────────────────────────────────
  {
    id: 'nuxt-004',
    difficulty: 'hard',
    skill: 'nuxt',
    input: {
      filePath: 'components/AnalyticsTracker.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Analytics Dashboard</h1>
    <p>Tracking active users...</p>
  </div>
</template>

<script setup lang="ts">
const API_KEY = 'sk-proj-abc123def456ghi789'
const API_SECRET = 'secret_key_2024_xyz'

async function trackEvent(event: string) {
  await fetch('https://api.analytics.example.com/track', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'X-Api-Secret': API_SECRET,
    },
    body: JSON.stringify({ event }),
  })
}
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-client-secret'],
    },
    expectedFix: {
      codePattern: 'useRuntimeConfig',
      shouldNotExist: ['sk-proj-', 'secret_key_'],
    },
    tags: ['security', 'secrets'],
  },

  // ─── nuxt-ssr-misuse ──────────────────────────────────────
  {
    id: 'nuxt-005',
    difficulty: 'hard',
    skill: 'nuxt',
    input: {
      filePath: 'components/ViewportTracker.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <p>Window width: {{ width }}</p>
    <p>Scroll position: {{ scrollY }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const width = ref(window.innerWidth)
const scrollY = ref(window.scrollY)

window.addEventListener('resize', () => {
  width.value = window.innerWidth
})

window.addEventListener('scroll', () => {
  scrollY.value = window.scrollY
})
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-ssr-misuse'],
    },
    expectedFix: {
      codePattern: 'onMounted',
      shouldNotExist: ['window.'],
    },
    tags: ['ssr', 'window'],
  },

  // ─── nuxt-pagemeta-missing ────────────────────────────────
  {
    id: 'nuxt-006',
    difficulty: 'easy',
    skill: 'nuxt',
    input: {
      filePath: 'pages/about.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>About Us</h1>
    <p>We are a company building great products.</p>
  </div>
</template>

<script setup lang="ts">
const companyName = 'My Company'
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-pagemeta-missing'],
    },
    expectedFix: {
      codePattern: 'definePageMeta',
      shouldNotExist: [],
    },
    tags: ['metadata', 'seo'],
  },

  // ─── nuxt-hardcoded-url ───────────────────────────────────
  {
    id: 'nuxt-007',
    difficulty: 'medium',
    skill: 'nuxt',
    input: {
      filePath: 'components/UserList.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Users</h1>
    <ul>
      <li v-for="user in users" :key="user.id">
        {{ user.name }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const users = ref([])

onMounted(async () => {
  const res = await fetch('https://api.example.com/v1/users')
  const data = await res.json()
  users.value = data
})
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['nuxt-hardcoded-url'],
    },
    expectedFix: {
      codePattern: 'useRuntimeConfig',
      shouldNotExist: ['https://api.example.com'],
    },
    tags: ['configuration', 'api'],
  },

  // ─── nuxt-error-missing ───────────────────────────────────
  {
    id: 'nuxt-008',
    difficulty: 'easy',
    skill: 'nuxt',
    input: {
      filePath: 'pages/checkout.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <h1>Checkout</h1>
    <form>
      <input type="text" placeholder="Card number" />
      <input type="text" placeholder="Expiry date" />
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
    },
    expectedFix: {
      codePattern: '',
      shouldNotExist: [],
    },
    tags: ['error-boundary'],
  },

  // ─── clean-nuxt-page ──────────────────────────────────────
  {
    id: 'nuxt-009',
    difficulty: 'easy',
    skill: 'nuxt',
    input: {
      filePath: 'pages/profile.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <main>
    <nav>
      <NuxtLink to="/">Home</NuxtLink>
      <NuxtLink to="/settings">Settings</NuxtLink>
    </nav>
    <h1>Profile</h1>
    <NuxtImg
      src="/avatars/user.jpg"
      alt="User avatar"
      width="200"
      height="200"
    />
    <p>Welcome to your profile page.</p>
  </main>
</template>

<script setup lang="ts">
definePageMeta({
  title: 'User Profile',
  layout: 'default',
})

const config = useRuntimeConfig()
const apiUrl = config.public.apiBase
</script>`,
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

  // ─── multiple-issues-nuxt ─────────────────────────────────
  {
    id: 'nuxt-010',
    difficulty: 'hard',
    skill: 'nuxt',
    input: {
      filePath: 'pages/store.vue',
      stack: ['vue', 'typescript'],
      code: `<template>
  <div>
    <a href="/">Back to Home</a>
    <h1>Store</h1>
    <img src="/store-banner.png" alt="Store banner" />
    <p>Current viewport: {{ viewport }}</p>
    <a href="/cart">View Cart</a>
  </div>
</template>

<script setup lang="ts">
const viewport = window.innerWidth + 'x' + window.innerHeight

function resize() {
  const el = document.querySelector('h1')
  if (el) {
    el.textContent = 'Resized'
  }
}
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: [
        'nuxt-image-missing',
        'nuxt-link-missing',
        'nuxt-ssr-misuse',
      ],
    },
    expectedFix: {
      codePattern: '<NuxtImg',
      shouldNotExist: ['<img', '<a href'],
    },
    tags: ['multiple-issues'],
  },
];

export default nuxtGoldenCases;
