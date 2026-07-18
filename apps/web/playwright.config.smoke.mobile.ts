import { defineConfig, devices } from '@playwright/test';
import { MOBILE_SMOKE_SPECS } from './tests/e2e/smoke-manifest';
import { vercelAutomationHeaders } from './tests/e2e/utils/vercel-automation-headers';
import { resolveWebServerWarmupProfile } from './tests/e2e/utils/warmup-profile';

const vercelAutomation = vercelAutomationHeaders();

/**
 * Smoke Test Playwright Configuration (Mobile)
 *
 * Mobile-viewport parity for the focused smoke lane. Runs the spec files
 * declared in `tests/e2e/smoke-manifest.ts` → MOBILE_SMOKE_SPECS against an
 * iPhone-class viewport so mobile overflow and viewport-stability regressions
 * are caught before they reach production.
 *
 * See `apps/web/tests/TESTING.md` → "Smoke Lanes" for the canonical policy.
 *
 * Usage:
 *   pnpm --filter=@jovie/web exec playwright test --config=playwright.config.smoke.mobile.ts
 */

const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;
const useTestAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const isCI = !!process.env.CI;
const webServerWarmupProfile = resolveWebServerWarmupProfile({ isCI });
const usesManagedLocalWebServer = !process.env.BASE_URL;
const shouldThrottleManagedTestAuthRun =
  isCI && usesManagedLocalWebServer && useTestAuthBypass;

function getWorkers(defaultWorkers: number): number {
  const explicitWorkers = process.env.PLAYWRIGHT_WORKERS;
  if (explicitWorkers) {
    const parsedWorkers = Number.parseInt(explicitWorkers, 10);
    if (Number.isFinite(parsedWorkers) && parsedWorkers > 0) {
      return parsedWorkers;
    }
  }

  return shouldThrottleManagedTestAuthRun ? 1 : defaultWorkers;
}

export default defineConfig({
  captureGitInfo: { commit: false, diff: false },
  testDir: './tests/e2e',
  // Source of truth: tests/e2e/smoke-manifest.ts → MOBILE_SMOKE_SPECS.
  testMatch: [...MOBILE_SMOKE_SPECS],
  fullyParallel: !shouldThrottleManagedTestAuthRun,
  forbidOnly: true,
  retries: 2,
  workers: getWorkers(4),
  reporter: [
    ['line'],
    ...(isCI ? [] : ([['html', { open: 'never' }]] as const)),
    ...(vercelAutomation.active
      ? []
      : ([
          ['json', { outputFile: 'test-results/results-mobile.json' }],
        ] as const)),
  ],

  timeout: 90_000,
  expect: {
    timeout: 25_000,
  },

  use: {
    baseURL,
    trace: isCI ? 'off' : 'on-first-retry',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    ...(vercelAutomation.active && {
      extraHTTPHeaders: vercelAutomation.headers,
    }),
    storageState: { cookies: [], origins: [] },
  },

  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Only start web server if BASE_URL is not set (CI provides BASE_URL)
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          // Pin Doppler scope explicitly so worktrees never inherit whichever
          // scope happens to be active in the parent shell.
          // See .claude/rules/environment.md.
          command: process.env.DATABASE_URL
            ? 'pnpm run dev:fast'
            : 'doppler run --project jovie-web --config dev -- pnpm run dev:fast',
          env: {
            NODE_ENV: 'test',
            PORT: managedWebServerPort,
            NEXT_PUBLIC_E2E_MODE: '1',
            NEXT_DISABLE_TOOLBAR: '1',
            E2E_USE_TEST_AUTH_BYPASS: useTestAuthBypass ? '1' : '0',
            E2E_WEB_SERVER_WARMUP: webServerWarmupProfile,
            ...(useTestAuthBypass
              ? {
                  NEXT_PUBLIC_CLERK_MOCK: '1',
                  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
                }
              : {}),
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: true,
          timeout: 300_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
