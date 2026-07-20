import { defineConfig, devices } from '@playwright/test';
import { RELIABILITY_CANARY_E2E_GLOBS } from './lib/testing/reliability-detectors';
import { vercelAutomationHeaders } from './tests/e2e/utils/vercel-automation-headers';

const vercelAutomation = vercelAutomationHeaders();

const isCI = !!process.env.CI;
const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;

/**
 * Nightly E2E Test Configuration
 *
 * These tests are comprehensive and run on a schedule (nightly) rather than on every PR.
 * They cover detailed feature testing, edge cases, and scenarios that are too
 * time-consuming for rapid deployment smoke tests.
 *
 * Run with: pnpm exec playwright test --config=playwright.config.nightly.ts
 */
export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  testMatch: [
    '**/nightly/**/*.spec.ts',
    '**/dashboard-pages-health.spec.ts',
    '**/onboarding-completion.spec.ts',
    '**/onboarding-robot.full.spec.ts',
    ...RELIABILITY_CANARY_E2E_GLOBS,
  ],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  reporter: isCI
    ? [
        ['line'],
        ...(vercelAutomation.active
          ? []
          : ([
              ['json', { outputFile: 'test-results/nightly-results.json' }],
            ] as const)),
      ]
    : 'html',

  // Longer timeouts for comprehensive testing
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },

  use: {
    baseURL,
    trace: isCI ? 'off' : 'on-first-retry',
    video: isCI ? 'off' : 'retain-on-failure',
    screenshot: isCI ? 'off' : 'only-on-failure',
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    ...(vercelAutomation.active && {
      extraHTTPHeaders: vercelAutomation.headers,
    }),
    storageState: 'tests/.auth/user.json',
  },

  projects: [
    {
      name: 'auth-setup',
      testDir: '../',
      testMatch: /auth\.setup\.ts/,
      // Ensure setup project never attempts to read persisted auth from disk.
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'chromium',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      dependencies: ['auth-setup'],
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      dependencies: ['auth-setup'],
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Only start web server if not in CI (when BASE_URL is not set)
  ...(isCI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          // Pin Doppler scope explicitly so worktrees never inherit whichever
          // scope happens to be active in the parent shell.
          // See .claude/rules/environment.md.
          command: process.env.DATABASE_URL
            ? 'pnpm run dev:local'
            : 'doppler run --project jovie-web --config dev -- pnpm run dev:local',
          env: {
            NODE_ENV: 'test',
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: !isCI,
          timeout: 90000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
