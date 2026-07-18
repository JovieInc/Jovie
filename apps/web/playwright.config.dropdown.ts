/**
 * Playwright config for dropdown parity eval
 *
 * Points at the existing dev server on port 3000 (no auth required).
 * Run: npx playwright test --config playwright.config.dropdown.ts
 */
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: /dropdown-parity\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: isCI ? 'off' : 'retain-on-failure',
    // No storageState — our test overrides to empty anyway
    storageState: { cookies: [], origins: [] },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Reuse the running dev server — do NOT start a new one
  webServer: {
    command: 'echo "Using existing dev server"',
    url: process.env.BASE_URL ?? 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 5_000,
  },
});
