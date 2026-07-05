/**
 * Playwright Configuration – Golden Journey Capture (JOV #11815)
 *
 * Captures route-level screenshots of the golden journey set (logged-out +
 * seeded logged-in states) for the post-deploy design-taste sweep.
 *
 * Usage:
 *   pnpm --filter web golden-journey:capture
 */

import { defineConfig, devices } from '@playwright/test';

const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

// Pin Doppler scope explicitly so worktrees never inherit whichever scope
// happens to be active in the parent shell. See .claude/rules/environment.md.
const webServerCommand = process.env.DATABASE_URL
  ? 'pnpm run dev:local'
  : 'doppler run --project jovie-web --config dev -- pnpm run dev:local';
const baseURL = process.env.BASE_URL || 'http://localhost:3110';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3110';
}
const managedWebServerPort = managedWebServerUrl.port;

export default defineConfig({
  testDir: './tests/golden-journey',
  testMatch: '**/capture.spec.ts',
  fullyParallel: false, // Sequential for deterministic captures
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [['line']],

  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
  },

  projects: [
    {
      name: 'golden-journey',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: 'dark',
      },
    },
  ],

  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
            NEXT_PUBLIC_E2E_MODE: '1',
            NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
            // Logged-in golden journeys bootstrap through the dev test-auth
            // bypass personas (see .claude/rules/auth.md).
            E2E_USE_TEST_AUTH_BYPASS: '1',
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: process.env.REUSE_EXISTING_SERVER === '1',
          timeout: 300_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
