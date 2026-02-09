import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: 'tests/.auth/user.json',
  },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      // biome-ignore lint/suspicious/noExplicitAny: Playwright requires this pattern for setup projects
      use: { storageState: undefined as any, headless: true },
    },
    {
      name: 'chromium',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer - use existing server
  globalSetup: require.resolve('./tests/global-setup.ts'),
});
