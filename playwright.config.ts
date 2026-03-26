import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'cd packages/server && npx tsx src/index.ts',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'cd packages/web && npx next dev',
      port: 3000,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
