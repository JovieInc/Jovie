/**
 * Playwright Configuration – Product Screenshots
 *
 * Generates high-resolution marketing screenshots from a running app instance.
 * Uses a wide viewport at 2x device scale for retina-quality output.
 *
 * Prerequisites:
 *   1. E2E test user must exist (run seed-test-data.ts)
 *   2. Screenshot data must be seeded (run tests/product-screenshots/seed.ts)
 *   3. App must be running or will be started via webServer config
 *
 * Usage:
 *   pnpm --filter web screenshots          # seed + capture
 *   pnpm --filter web screenshots:capture  # capture only (skip seed)
 */

import { defineConfig, devices } from '@playwright/test';

const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

const webServerCommand = process.env.DATABASE_URL
  ? 'pnpm run dev:local'
  : 'doppler run -- pnpm run dev:local';

export default defineConfig({
  testDir: './tests/product-screenshots',
  testMatch: '**/*.spec.ts',
  fullyParallel: false, // Run sequentially for deterministic screenshots
  forbidOnly: true,
  retries: 1, // One retry in case of flaky image loads
  workers: 1,
  reporter: [['line']],

  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'off',
    video: 'off',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    // Reuse authenticated session from global setup
    storageState: 'tests/.auth/user.json',
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
  },

  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      testDir: './tests/e2e',
      // Ensure setup project never attempts to read persisted auth from disk.
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'screenshots',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        // Force a clean, consistent appearance
        colorScheme: 'dark',
      },
    },
  ],

  // Start the dev server if not running against an external URL
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3100',
            NEXT_DISABLE_TOOLBAR: '1',
          },
          url: 'http://localhost:3100',
          reuseExistingServer: true,
          timeout: 300_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
