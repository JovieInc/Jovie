import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * Playwright Configuration for Synthetic Monitoring
 *
 * Optimized for:
 * - Production environment testing
 * - Fast execution (5-10 minute intervals)
 * - Reliable results with retries
 * - Minimal resource usage
 */

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: [
    '**/synthetic-auth-ui.spec.ts',
    '**/synthetic-golden-path.spec.ts',
    '**/synthetic-legacy-otp.spec.ts',
    '**/synthetic-better-auth-account.spec.ts',
    '**/onboarding-robot.full.spec.ts',
    '**/public-profile-smoke.spec.ts',
    // Production Journey Auditor: anonymous signup→interview initialization
    // probe. Prod gates the full turn behind Turnstile, so the smoke verifies
    // the interview *initializes* (the gap the prod break fell through).
    '**/canary-auth-signup-onboarding.spec.ts',
  ],
  fullyParallel: false, // Sequential for stability in prod
  forbidOnly: true, // Always enforced in synthetic mode
  retries: 2, // Retry failed tests to avoid false alarms
  workers: 1, // Single worker for consistency
  timeout: 240_000, // 4 minutes per test
  globalTimeout: 900_000, // 15 minutes total

  reporter: [
    [
      'json',
      {
        outputFile:
          process.env.SYNTHETIC_PLAYWRIGHT_JSON_OUTPUT_FILE ??
          'test-results/results.json',
      },
    ],
    ...(isCI
      ? []
      : ([
          ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ] as const)),
    ['line'],
    // Compact, redacted failure packet per failed journey (route, step,
    // screenshot, console errors, failed requests, trace path).
    ['./tests/e2e/reporters/journey-failure-packet.ts'],
  ],

  use: {
    // Use the BASE_URL from environment (production or preview)
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL,

    // Production-optimized settings
    actionTimeout: 30_000, // 30 seconds for actions
    navigationTimeout: 60_000, // 1 minute for navigation

    // Tracing and debugging
    trace: isCI ? 'off' : 'retain-on-failure',
    screenshot: isCI ? 'off' : 'only-on-failure',
    video: isCI ? 'off' : 'retain-on-failure',

    // Browser settings for synthetic monitoring
    ignoreHTTPSErrors: false, // Strict HTTPS validation in prod
    viewport: { width: 1280, height: 720 },
    userAgent: 'Jovie-SyntheticMonitoring/1.0 (Playwright)',

    // Headers to identify synthetic traffic
    extraHTTPHeaders: {
      'X-Synthetic-Monitoring': 'true',
      'X-Test-Environment': process.env.E2E_ENVIRONMENT || 'unknown',
    },
  },

  projects: [
    {
      name: 'chromium-synthetic',
      use: {
        ...devices['Desktop Chrome'],
        // Additional synthetic monitoring settings
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security', // For cross-origin requests in tests
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        },
      },
    },
  ],

  // No web server - testing against live environments
  expect: {
    // Longer timeouts for production environments
    timeout: 15_000, // 15 seconds for assertions
  },

  // Global setup for synthetic monitoring
  globalSetup: require.resolve('./tests/synthetic-setup.ts'),
  globalTeardown: require.resolve('./tests/synthetic-teardown.ts'),
});
