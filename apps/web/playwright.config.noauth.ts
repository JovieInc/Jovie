import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for tests that don't require authentication
 * This config bypasses Clerk authentication for faster test execution
 */
const stableLocalServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND ?? 'pnpm run dev:local:playwright';
const webServerCommand = process.env.DATABASE_URL
  ? stableLocalServerCommand
  : `doppler run -- ${stableLocalServerCommand}`;

process.env.PUBLIC_NOAUTH_SMOKE = '1';
const shouldSkipManagedWebServer = process.env.E2E_SKIP_WEB_SERVER === '1';

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
  ...(shouldSkipManagedWebServer || (process.env.CI && process.env.BASE_URL)
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
            NEXT_PUBLIC_E2E_MODE: '1',
            PUBLIC_NOAUTH_SMOKE: '1',
            NEXT_DISABLE_TOOLBAR: '1',
            E2E_FAST_ONBOARDING: '1',
            NODE_OPTIONS:
              `${process.env.NODE_OPTIONS || ''} --max-old-space-size=12288`.trim(),
          },
        },
      }),
  globalSetup: require.resolve('./tests/global-setup.ts'),
});
