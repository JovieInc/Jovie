/**
 * Playwright Configuration – Help Center visual proof capture (JOV-5900)
 *
 * Captures deterministic, seeded-account screenshots for Help Center guides
 * into `apps/docs/public/proof/`. Runs sequentially at pinned viewports with a
 * fixed clock so repeated runs on the same build produce stable assets.
 *
 * Authentication reuses the shared E2E bootstrap: the `auth-setup` project
 * (tests/e2e/auth.setup.ts) writes `tests/.auth/user.json` and the capture
 * project consumes it via `storageState`.
 *
 * Usage:
 *   pnpm --filter web docs-guide-shots                      # all plan entries
 *   pnpm --filter web docs-guide-shots -- --grep <article>  # path-scoped set
 *   node scripts/help-center-visual-assets.mjs affected --base <sha> --head <sha>
 */

import { defineConfig, devices } from '@playwright/test';
import { vercelAutomationHeaders } from './tests/e2e/utils/vercel-automation-headers';

const vercelAutomation = vercelAutomationHeaders();

const webServerCommand = process.env.DATABASE_URL
  ? 'pnpm run dev:local'
  : 'doppler run --project jovie-web --config dev -- pnpm run dev:local';
const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests',
  testMatch: ['e2e/auth.setup.ts', 'docs-guides/capture.spec.ts'],
  fullyParallel: false, // Sequential for deterministic screenshots
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
    ...(vercelAutomation.active && {
      extraHTTPHeaders: vercelAutomation.headers,
    }),
  },

  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'docs-guides',
      testMatch: /docs-guides\/capture\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/user.json',
        deviceScaleFactor: 2,
      },
    },
  ],

  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          env: {
            NODE_ENV: 'test',
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
            NEXT_PUBLIC_E2E_MODE: '1',
            NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: process.env.REUSE_EXISTING_SERVER === '1',
          timeout: 300_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
