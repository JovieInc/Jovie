import { defineConfig } from '@playwright/test';
import smoke from './playwright.config.smoke';

// The reviewed smoke manifest supplies concurrent load. No focused grep/repeat,
// dev server, screenshots, traces, video, error contexts, or raw JSON reporter.
export default defineConfig({
  ...smoke,
  fullyParallel: true,
  workers: 8,
  retries: 0,
  reporter: [['./scripts/chat-performance-reporter.ts']],
  outputDir: process.env.CHAT_COMPARISON_PRIVATE_OUTPUT,
  use: { ...smoke.use, trace: 'off', screenshot: 'off', video: 'off' },
});
