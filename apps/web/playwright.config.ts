import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration optimized for E2E test reliability
 *
 * Key optimizations:
 * - Extended webServer timeout (120s) for cold start reliability
 * - Configurable retry strategy based on environment
 * - Action and navigation timeouts for stability
 * - Global setup and teardown for proper test isolation
 * - Trace, video, and screenshot capture for debugging failures
 */

// Build extra HTTP headers for Vercel Deployment Protection bypass
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retry strategy: 2 retries in CI for flakiness mitigation, 1 locally for quick feedback
  retries: process.env.CI ? 2 : 1,
  // Worker configuration: 4 workers in CI for parallelism, auto-detect locally
  workers: process.env.CI ? 4 : undefined,
  reporter: 'html',
  // Global timeout per test (default 30s is reasonable for most tests)
  timeout: 30000,
  // Expect timeout for assertions with auto-retry
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    // Action timeout for click, fill, etc. - prevents hanging on unresponsive elements
    actionTimeout: 15000,
    // Navigation timeout - allows for slow page loads during development
    navigationTimeout: 30000,
    // Trace on first retry for debugging flaky tests
    trace: 'on-first-retry',
    // Video on failure for visual debugging
    video: 'retain-on-failure',
    // Screenshot on failure for quick debugging
    screenshot: 'only-on-failure',
    // Add Vercel bypass header when secret is available (for staging/canary)
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
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
          // Extended timeout for cold start reliability (Next.js dev server can take 60-90s on first run)
          timeout: 120000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
  // Global setup for Clerk authentication, database seeding, and browser warmup
  globalSetup: require.resolve('./tests/global-setup.ts'),
  // Global teardown for cleanup after all tests complete
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
});
