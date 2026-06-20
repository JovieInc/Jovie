import { defineConfig, devices } from '@playwright/test';
import { DESKTOP_SMOKE_SPECS } from './tests/e2e/smoke-manifest';

/**
 * Smoke Test Playwright Configuration (Desktop)
 *
 * Focused config for the highest-signal smoke test files that gate production
 * deploys. Optimized for speed: higher parallelism, shorter timeouts, no
 * video recording.
 *
 * The spec list lives in `tests/e2e/smoke-manifest.ts` so the package script,
 * the CI workflow, and this config stay in lockstep. See
 * `apps/web/tests/TESTING.md` → "Smoke Lanes" for the canonical policy.
 *
 * Usage:
 *   pnpm --filter=@jovie/web exec playwright test --config=playwright.config.smoke.ts
 */

// Build extra HTTP headers for Vercel Deployment Protection bypass
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const managedWebServerUrl = new URL(baseURL);
if (!managedWebServerUrl.port) {
  managedWebServerUrl.port = '3100';
}
const managedWebServerPort = managedWebServerUrl.port;
const useTestAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
const isCI = !!process.env.CI;
const usesManagedLocalWebServer = !process.env.BASE_URL;
const shouldThrottleManagedTestAuthRun =
  isCI && usesManagedLocalWebServer && useTestAuthBypass;
// GitHub-hosted runners have ~7 GiB RAM; an 8 GiB Node heap plus Chromium OOMs mid-run.
const smokeWebServerHeapMb = isCI ? 4096 : 8192;

function buildSmokeWebServerNodeOptions(): string {
  const withoutHeap = (process.env.NODE_OPTIONS ?? '')
    .replace(/--max-old-space-size=\d+/g, '')
    .trim();

  return `${withoutHeap} --max-old-space-size=${smokeWebServerHeapMb}`.trim();
}

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
  testDir: './tests/e2e',
  // Source of truth: tests/e2e/smoke-manifest.ts → DESKTOP_SMOKE_SPECS.
  testMatch: [...DESKTOP_SMOKE_SPECS],
  fullyParallel: !shouldThrottleManagedTestAuthRun,
  forbidOnly: true,
  retries: 2,
  workers: getWorkers(8),
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  timeout: 90_000,
  expect: {
    timeout: 25_000,
  },

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'off',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
    storageState: { cookies: [], origins: [] },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
            ? 'pnpm run dev:local:playwright'
            : 'doppler run --project jovie-web --config dev -- pnpm run dev:local:playwright',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: managedWebServerPort,
            NEXT_DISABLE_TOOLBAR: '1',
            E2E_USE_TEST_AUTH_BYPASS: useTestAuthBypass ? '1' : '0',
            ...(useTestAuthBypass
              ? {
                  NEXT_PUBLIC_CLERK_MOCK: '1',
                  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
                }
              : {}),
            NODE_OPTIONS: buildSmokeWebServerNodeOptions(),
          },
          url: managedWebServerUrl.origin,
          reuseExistingServer: true,
          timeout: 300000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  globalSetup: require.resolve('./tests/global-setup.ts'),
});
