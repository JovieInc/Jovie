import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for tests that don't require authentication
 * This config bypasses Clerk authentication for faster test execution
 */
const webServerCommand = process.env.DATABASE_URL
  ? 'pnpm run dev:local'
  : 'doppler run -- pnpm run dev:local';

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
    // Add custom headers to bypass Clerk in test mode
    extraHTTPHeaders: {
      'x-test-mode': 'bypass-auth',
    },
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
  // Only start web server if not in CI
  ...(process.env.CI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          url: 'http://localhost:3100',
          reuseExistingServer: !process.env.CI,
          timeout: 300000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3100',
            NEXT_DISABLE_TOOLBAR: '1',
            NODE_OPTIONS:
              `${process.env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim(),
          },
        },
      }),
});
