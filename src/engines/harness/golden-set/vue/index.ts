/**
 * Vue Golden Set
 *
 * 10 test cases for Vue SFC component analysis
 */

import type { GoldenTestCase } from '../../types';

export const vueGoldenCases: GoldenTestCase[] = [
  // ─── v-for without :key ──────────────────────────────────
  {
    id: 'vue-001',
    skill: 'vue',
    difficulty: 'easy',
    tags: ['v-for', 'key', 'list-rendering'],
    input: {
      filePath: 'src/components/UserList.vue',
      stack: ['vue'],
      code: `<template>
  <ul>
    <li v-for="user in users">
      {{ user.name }}
    </li>
  </ul>
</template>

<script setup lang="ts">
defineProps<{
  users: { id: string; name: string }[]
}>()
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['missing-v-for-key'],
    },
    expectedFix: {
      codePattern: ':key="index"',
      shouldNotExist: [],
    },
  },

  // ─── v-if with v-for ─────────────────────────────────────
  {
    id: 'vue-002',
    skill: 'vue',
    difficulty: 'medium',
    tags: ['v-if', 'v-for', 'performance'],
    input: {
      filePath: 'src/components/FilteredItems.vue',
      stack: ['vue'],
      code: `<template>
  <div>
    <div v-for="item in items" v-if="item.visible">
      {{ item.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: { id: string; name: string; visible: boolean }[]
}>()
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['v-if-with-v-for'],
      falsePositives: ['missing-v-for-key'],
    },
    expectedFix: {
      codePattern: 'computed',
      shouldNotExist: [],
    },
  },

  // ─── v-html usage ────────────────────────────────────────
  {
    id: 'vue-003',
    skill: 'vue',
    difficulty: 'medium',
    tags: ['v-html', 'xss', 'security'],
    input: {
      filePath: 'src/components/RichText.vue',
      stack: ['vue'],
      code: `<template>
  <div class="rich-text" v-html="content"></div>
</template>

<script setup lang="ts">
defineProps<{
  content: string
}>()
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['v-html-usage'],
    },
    expectedFix: {
      codePattern: 'v-text',
      shouldNotExist: [],
    },
  },

  // ─── img without alt ─────────────────────────────────────
  {
    id: 'vue-004',
    skill: 'vue',
    difficulty: 'easy',
    tags: ['a11y', 'img', 'alt'],
    input: {
      filePath: 'src/components/HeroImage.vue',
      stack: ['vue'],
      code: `<template>
  <div class="hero">
    <img src="/hero-banner.jpg" />
  </div>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['img-without-alt-vue'],
    },
    expectedFix: {
      codePattern: 'alt="Image description"',
      shouldNotExist: [],
    },
  },

  // ─── Anchor without accessible name ───────────────────────
  {
    id: 'vue-005',
    skill: 'vue',
    difficulty: 'easy',
    tags: ['a11y', 'anchor', 'aria'],
    input: {
      filePath: 'src/components/SocialLink.vue',
      stack: ['vue'],
      code: `<template>
  <a href="#"></a>
</template>

<script setup lang="ts">
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['anchor-without-name-vue'],
    },
    expectedFix: {
      codePattern: 'aria-label="Link"',
      shouldNotExist: [],
    },
  },

  // ─── Direct DOM access ───────────────────────────────────
  {
    id: 'vue-006',
    skill: 'vue',
    difficulty: 'hard',
    tags: ['dom', 'direct-access', 'anti-pattern'],
    input: {
      filePath: 'src/components/DomManipulator.vue',
      stack: ['vue'],
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
      issueTypes: ['direct-dom-access'],
    },
    expectedFix: {
      codePattern: 'ref',
      shouldNotExist: [],
    },
  },

  // ─── Unused prop (array syntax) ──────────────────────────
  {
    id: 'vue-007',
    skill: 'vue',
    difficulty: 'easy',
    tags: ['props', 'unused', 'defineProps'],
    input: {
      filePath: 'src/components/UserCard.vue',
      stack: ['vue'],
      code: `<template>
  <div class="card">
    <h3>{{ name }}</h3>
    <p>{{ email }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps(['name', 'email', 'unusedProp'])
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 1,
      issueTypes: ['unused-prop-vue'],
    },
    expectedFix: {
      codePattern: "defineProps(['name', 'email'])",
      shouldNotExist: ['unusedProp'],
    },
  },

  // ─── Unused prop (object syntax) ─────────────────────────
  {
    id: 'vue-008',
    skill: 'vue',
    difficulty: 'medium',
    tags: ['props', 'unused', 'defineProps', 'object-syntax'],
    input: {
      filePath: 'src/components/ArticlePreview.vue',
      stack: ['vue'],
      code: `<template>
  <article class="preview">
    <h2>{{ title }}</h2>
  </article>
</template>

<script setup lang="ts">
defineProps({
  title: String,
  description: String,
  publishedAt: String,
})
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 2,
      issueTypes: ['unused-prop-vue'],
    },
    expectedFix: {
      codePattern: 'defineProps({\n  title: String,\n})',
      shouldNotExist: ['description', 'publishedAt'],
    },
  },

  // ─── Clean component (no issues) ─────────────────────────
  {
    id: 'vue-009',
    skill: 'vue',
    difficulty: 'easy',
    tags: ['clean', 'best-practices'],
    input: {
      filePath: 'src/components/GoodList.vue',
      stack: ['vue'],
      code: `<template>
  <div>
    <input
      v-model="search"
      type="text"
      aria-label="Search items"
    />
    <ul>
      <li v-for="item in filtered" :key="item.id">
        <a :href="item.url" aria-label="Go to {{ item.name }}">
          {{ item.name }}
        </a>
      </li>
    </ul>
    <img :src="heroImage" alt="Hero banner" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  items: { id: string; name: string; url: string }[]
}>()

const search = ref('')

const filtered = computed(() =>
  props.items.filter(item =>
    item.name.toLowerCase().includes(search.value.toLowerCase())
  )
)

const heroImage = '/hero.jpg'
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
  },

  // ─── Multiple issues ─────────────────────────────────────
  {
    id: 'vue-010',
    skill: 'vue',
    difficulty: 'hard',
    tags: ['multiple-issues', 'v-for', 'v-if', 'v-html'],
    input: {
      filePath: 'src/components/BadComponent.vue',
      stack: ['vue'],
      code: `<template>
  <div class="bad">
    <div v-for="item in items" v-if="item.active">
      <span v-html="item.content"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: { id: string; active: boolean; content: string }[]
}>()
</script>`,
    },
    expectedDiagnosis: {
      issueCount: 3,
      issueTypes: ['missing-v-for-key', 'v-if-with-v-for', 'v-html-usage'],
    },
    expectedFix: {
      codePattern: 'computed',
      shouldNotExist: [],
    },
  },
];

export default vueGoldenCases;
