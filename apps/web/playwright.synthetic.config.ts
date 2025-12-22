import { defineConfig, devices } from '@playwright/test';

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
  testDir: './tests/e2e',
  testMatch: '**/synthetic-golden-path.spec.ts',
  fullyParallel: false, // Sequential for stability in prod
  forbidOnly: true, // Always enforced in synthetic mode
  retries: 2, // Retry failed tests to avoid false alarms
  workers: 1, // Single worker for consistency
  timeout: 120_000, // 2 minutes per test
  globalTimeout: 600_000, // 10 minutes total

  reporter: [
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['line'],
  ],

  use: {
    // Use the BASE_URL from environment (production or preview)
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL,

    // Production-optimized settings
    actionTimeout: 30_000, // 30 seconds for actions
    navigationTimeout: 60_000, // 1 minute for navigation

    // Tracing and debugging
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

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
