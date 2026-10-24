import { defineConfig, devices } from '@playwright/test';
import { worktreeMetadata } from './scripts/playwright-worktree';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3100';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('The blocking journey requires a local, isolated server');
}

// A separate selector keeps the blocking journey independent of the manual,
// real-provider golden path. Missing fixtures fail; no auth/storage state is reused.
export default defineConfig({
  metadata: worktreeMetadata(baseURL, true, __dirname),
  globalSetup: require.resolve('./tests/journey-global-setup.ts'),
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: 'blocking-journey.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 480_000,
  expect: { timeout: 60_000 },
  reporter: 'line',
  use: {
    baseURL,
    navigationTimeout: 120_000,
    storageState: { cookies: [], origins: [] },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run dev:local:playwright',
    url: `${baseURL}/start`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NODE_ENV: 'test',
      PORT: new URL(baseURL).port || '3100',
      E2E_TEST_MODE: '1',
      STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_jovie_journey_pro',
      NEXT_PUBLIC_E2E_MODE: '1',
      NEXT_DISABLE_TOOLBAR: '1',
      E2E_WEB_SERVER_WARMUP: 'none',
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
