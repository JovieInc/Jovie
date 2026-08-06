import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Storybook-based visual specs (JOV-2156).
 *
 * Unlike the app-level configs, this one serves Storybook (dev server on
 * :6006) instead of the Next.js app. CI lanes that already started Storybook
 * set STORYBOOK_BASE_URL to skip the managed webServer.
 *
 * Snapshot settings intentionally mirror playwright.config.ts so baselines in
 * tests/e2e/__snapshots__ stay interchangeable between configs.
 */
const isCI = !!process.env.CI;
const baseURL = process.env.STORYBOOK_BASE_URL || 'http://localhost:6006';

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: '**/storybook-*.spec.ts',
  fullyParallel: true,
  timeout: 120_000,
  expect: {
    timeout: 25_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.08, // 8% pixel difference allowed (cross-platform font rendering)
      threshold: 0.2, // Per-pixel color threshold
      animations: 'disabled',
    },
  },
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'line' : 'html',
  snapshotDir: './tests/e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL,
    // Fixed viewport so story screenshots are resolution-stable.
    viewport: { width: 1280, height: 800 },
    trace: isCI ? 'off' : 'on-first-retry',
    video: isCI ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Storybook cold-start (first story compile) in this monorepo can take
  // minutes; give the managed dev server a generous window.
  ...(process.env.STORYBOOK_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm run storybook -- --no-open',
          url: 'http://localhost:6006/iframe.html',
          reuseExistingServer: !isCI,
          timeout: 600_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
