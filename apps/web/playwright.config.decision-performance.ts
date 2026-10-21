import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STORYBOOK_BASE_URL ?? 'http://127.0.0.1:6874';

/** Model-free budgets run on optimized components, with real app styles. */
export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/performance',
  testMatch: '**/decision-inbox-performance.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 25_000 },
  reporter: 'line',
  use: { baseURL, trace: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  ...(process.env.STORYBOOK_BASE_URL
    ? {}
    : {
        webServer: {
          command:
            'JOVIE_DECISION_INBOX_PERF=1 pnpm exec storybook build --test --output-dir .cache/decision-inbox-storybook && pnpm exec vite preview --outDir .cache/decision-inbox-storybook --host 127.0.0.1 --port 6874 --strictPort',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 600_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
