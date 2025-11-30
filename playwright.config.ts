import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  // Only start web server if not in CI (when BASE_URL is not set)
  ...(process.env.CI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          // Use PORT env var to avoid CLI flag parsing issues
          command: 'PORT=3100 pnpm run dev',
          url: 'http://localhost:3100',
          reuseExistingServer: !process.env.CI,
          timeout: 120000, // Increase timeout to 2 minutes
        },
      }),
  // Add global setup to handle React context issues
  globalSetup: require.resolve('./tests/global-setup.ts'),
});
