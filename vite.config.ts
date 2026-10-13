import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Vite 8 bundles with rolldown: drop library console.error calls at bundle time (AGENTS.md "Build").
  build: { rolldownOptions: { treeshake: { manualPureFunctions: ['console.error'] } } },
  test: { include: ['tests/**/*.test.ts'] },
});
