import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  minify: false,
  sourcemap: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  external: [
    'playwright',
    '@playwright/test',
    'axe-core',
    'lighthouse',
    'better-sqlite3',
  ],
});
