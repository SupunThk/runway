import { defineConfig } from '@playwright/test';
import base from './playwright.config';

process.env.RUNWAY_TEST_ORIGIN = 'http://127.0.0.1:5300';
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.RUNWAY_TEST_ORIGIN },
  webServer: {
    command: 'node scripts/local-web.mjs',
    url: process.env.RUNWAY_TEST_ORIGIN,
    reuseExistingServer: true,
  },
});
