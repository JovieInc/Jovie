import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke Test Playwright Configuration
 *
 * Focused config for the highest-signal smoke test files that gate production deploys.
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

const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;
const useTestAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

export default defineConfig({
  testDir: './tests/e2e',
  // Keep this lane limited to the highest-signal unauthenticated/public/auth flows.
  testMatch: [
    'smoke-public.spec.ts',
    'golden-path.spec.ts',
    'signup-funnel.smoke.spec.ts',
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
    baseURL,
    trace: 'on-first-retry',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
    storageState: { cookies: [], origins: [] },
  },

  projects: [
    {
      name: 'chromium',
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
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
            E2E_USE_TEST_AUTH_BYPASS: useTestAuthBypass ? '1' : '0',
            ...(useTestAuthBypass
              ? {
                  NEXT_PUBLIC_CLERK_MOCK: '1',
                  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
                }
              : {}),
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: true,
          timeout: 300000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
