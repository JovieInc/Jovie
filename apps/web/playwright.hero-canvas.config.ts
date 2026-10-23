import { defineConfig } from '@playwright/test';

/** Scroll-progress proof for the flagged hero. No app server and no auth. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'homepage-hero-canvas-scroll.spec.ts',
  reporter: 'line',
  timeout: 60_000,
  use: {
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] },
  },
});
