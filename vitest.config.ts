import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
