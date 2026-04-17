/**
 * Playwright Configuration – Product Screenshots
 *
 * Generates high-resolution marketing screenshots from a running app instance.
 * Uses a wide viewport at 2x device scale for retina-quality output.
 *
 * Usage:
 *   pnpm --filter web screenshots
 *   pnpm --filter web screenshots:capture
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
const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;

export default defineConfig({
  testDir: './tests/product-screenshots',
  testMatch: '**/catalog.spec.ts',
  fullyParallel: false, // Run sequentially for deterministic screenshots
  forbidOnly: true,
  retries: 1, // One retry in case of flaky image loads
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
      name: 'screenshots',
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
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
            // Enable E2E mode so server-side gating disables DevToolbar,
            // Intercom, structured data scripts, and other non-screenshot UI.
            NEXT_PUBLIC_E2E_MODE: '1',
            // Disable Clerk proxy for screenshots — Clerk JS loads from its own
            // CDN instead of proxying through localhost (which requires HTTPS).
            NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
          },
          url: managedWebServerUrl.origin,
          // Default to fresh server so NEXT_PUBLIC_CLERK_PROXY_DISABLED is always
          // applied. A pre-running server won't have this flag, causing silent
          // Clerk JS loading failures. Opt in with REUSE_EXISTING_SERVER=1.
          reuseExistingServer: process.env.REUSE_EXISTING_SERVER === '1',
          timeout: 300_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
