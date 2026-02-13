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
      // Ensure setup project never attempts to read persisted auth from disk.
      use: { storageState: { cookies: [], origins: [] }, headless: true },
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
