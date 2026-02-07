import { defineConfig, devices } from '@playwright/test';

// Build extra HTTP headers for Vercel Deployment Protection bypass
// Both headers are required for browser automation to work correctly
// See: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

const isCI = !!process.env.CI;

/**
 * Nightly E2E Test Configuration
 *
 * These tests are comprehensive and run on a schedule (nightly) rather than on every PR.
 * They cover detailed feature testing, edge cases, and scenarios that are too
 * time-consuming for rapid deployment smoke tests.
 *
 * Run with: pnpm exec playwright test --config=playwright.config.nightly.ts
 */
export default defineConfig({
  testDir: './tests/e2e/nightly',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  reporter: isCI
    ? [
        ['line'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/nightly-results.json' }],
      ]
    : 'html',

  // Longer timeouts for comprehensive testing
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
    storageState: 'tests/.auth/user.json',
  },

  projects: [
    {
      name: 'auth-setup',
      testDir: '../',
      testMatch: /auth\.setup\.ts/,
      // biome-ignore lint/suspicious/noExplicitAny: Playwright requires this pattern for setup projects
      use: { storageState: undefined as any },
    },
    {
      name: 'chromium',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      dependencies: ['auth-setup'],
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      dependencies: ['auth-setup'],
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Only start web server if not in CI (when BASE_URL is not set)
  ...(isCI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: process.env.DATABASE_URL
            ? 'pnpm run dev:local'
            : 'doppler run -- pnpm run dev:local',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3100',
            NEXT_DISABLE_TOOLBAR: '1',
          },
          url: 'http://localhost:3100',
          reuseExistingServer: !isCI,
          timeout: 90000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
