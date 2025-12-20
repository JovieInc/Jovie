import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
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
    // Only run Firefox in full suite (not for smoke tests)
    ...(process.env.SMOKE_ONLY !== '1'
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
        ]
      : []),
    // Keep WebKit for local testing only (skip in CI)
    ...(!process.env.CI
      ? [
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
  // Only start web server if not in CI (when BASE_URL is not set)
  ...(process.env.CI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          // Use PORT env var to avoid CLI flag parsing issues
          command:
            'NODE_ENV=test PORT=3100 NEXT_DISABLE_TOOLBAR=1 pnpm run dev',
          url: 'http://localhost:3100',
          reuseExistingServer: !process.env.CI,
          timeout: 60000, // Reduced from 120s to 60s
          stdout: 'pipe', // Reduce noise
          stderr: 'pipe',
        },
      }),
  // Add global setup to handle React context issues
  globalSetup: require.resolve('./tests/global-setup.ts'),
});
