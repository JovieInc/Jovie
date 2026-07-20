/**
 * Playwright configuration for the Visual QA capture pipeline.
 *
 * Usage:
 *   VISUAL_QA_RUN_ID=demo-run pnpm --filter web visual-qa:capture
 *   VISUAL_QA_RUN_ID=demo-run VISUAL_QA_PHASE=baseline pnpm --filter web visual-qa:capture
 *   VISUAL_QA_RUN_ID=demo-run VISUAL_QA_BREAKPOINTS=compact pnpm --filter web visual-qa:breakpoint-check
 *   VISUAL_QA_RUN_ID=demo-run VISUAL_QA_THEMES=both pnpm --filter web visual-qa:capture
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
  testDir: './tests/visual-qa',
  testMatch: '**/capture.spec.ts',
  fullyParallel: false,
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
      name: 'visual-qa',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
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
