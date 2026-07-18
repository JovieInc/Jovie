import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    trace: isCI ? 'off' : 'on-first-retry',
    video: isCI ? 'off' : 'retain-on-failure',
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
