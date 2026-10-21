import { defineConfig } from '@playwright/test';

// The Playwright transform preserves serializable probe callbacks; tsx's
// keepNames transform injects __name references unavailable in the renderer.
export default defineConfig({
  testDir: './tests/performance',
  testMatch: 'performance-electron-chat.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 480_000,
  globalTimeout: 530_000,
  reporter: 'list',
  outputDir: '/tmp/jovie-electron-chat-artifacts',
});
