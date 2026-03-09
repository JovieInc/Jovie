import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke Test Playwright Configuration
 *
 * Focused config for the 4 required smoke test files that gate production deploys.
 * Optimized for speed: higher parallelism, shorter timeouts, no video recording.
 *
 * Usage:
 *   pnpm --filter=@jovie/web exec playwright test --config=playwright.config.smoke.ts
 */

// Build extra HTTP headers for Vercel Deployment Protection bypass
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

export default defineConfig({
  testDir: './tests/e2e',
  // Only include the 4 required smoke test files
  testMatch: [
    'smoke-public.spec.ts',
    'golden-path.spec.ts',
    'content-gate.spec.ts',
    'smoke-auth.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: true,
  retries: 2,
  workers: 8,
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  timeout: 90_000,
  expect: {
    timeout: 25_000,
  },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
    storageState: 'tests/.auth/user.json',
  },

  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'chromium',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only start web server if BASE_URL is not set (CI provides BASE_URL)
  ...(process.env.BASE_URL
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
          reuseExistingServer: true,
          timeout: 300000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
