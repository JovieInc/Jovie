/**
 * Playwright config for YC demo recording.
 *
 * Extends the main config (inherits globalSetup, webServer, Vercel bypass
 * headers) and overrides only what's needed for demo video capture:
 * - Always record video (not just on failure)
 * - 1280x720 viewport for standard HD
 * - Single worker (serial recording)
 * - 5-minute timeout (multi-DSP enrichment can take 120s)
 * - No auth-setup project (demo handles auth inline)
 *
 * Usage:
 *   pnpm run demo:record
 */

import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const port = Number(process.env.PORT ?? '3100');

export default defineConfig({
  ...baseConfig,
  testDir: './tests/e2e',
  testMatch: /yc-demo\.spec\.ts/,
  workers: 1,
  timeout: 300_000,
  retries: 0,
  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${port}`,
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
    storageState: { cookies: [], origins: [] },
  },
  projects: [{ name: 'demo', use: {} }],
  webServer: undefined,
});
