import { defineConfig } from '@playwright/test';

// Playwright preserves probe callbacks; tsx injects renderer-unknown __name.
export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/performance',
  testMatch: 'performance-electron-chat.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 480_000,
  globalTimeout: 530_000,
  reporter: 'list',
  use: { trace: process.env.CI ? 'off' : 'on-first-retry' },
  outputDir: '/tmp/jovie-electron-chat-artifacts',
});
