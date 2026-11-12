import { defineConfig } from 'vitest/config';
export default defineConfig({
  // Tests use injected RPC/database fixtures, never local dotenv configuration.
  envDir: false,
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
