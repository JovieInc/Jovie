import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

/** Scroll-progress proof for the flagged hero. No app server and no auth. */
export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: 'homepage-hero-canvas-scroll.spec.ts',
  reporter: 'line',
  timeout: 60_000,
  use: {
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] },
    trace: isCI ? 'off' : 'on-first-retry',
    video: 'off',
    screenshot: 'off',
  },
});
