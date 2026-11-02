import { defineConfig, devices } from '@playwright/test';

/**
 * Release-page service dial gestures (touch, keyboard, wheel), performance
 * budget and visual baseline against the /dev/dsp-dial harness. The harness is
 * development-only, so point BASE_URL at a `next dev` server.
 *
 *   BASE_URL=http://localhost:3100 pnpm --filter @jovie/web exec \
 *     playwright test --config=playwright.config.dsp-dial.ts
 */
export default defineConfig({
  testDir: './tests/e2e/dsp-dial',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    video: process.env.DIAL_VIDEO ? 'on' : 'off',
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
});
