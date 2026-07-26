import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  captureGitInfo: {
    commit: false,
    diff: false,
  },
  testDir: './tests/e2e',
  testMatch: 'audio-real-media-decoding.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  use: {
    trace: process.env.CI ? 'off' : 'on-first-retry',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
