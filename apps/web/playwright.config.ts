import { defineConfig, devices } from '@playwright/test';

// Build extra HTTP headers for Vercel Deployment Protection bypass
// Both headers are required for browser automation to work correctly
// See: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders['x-vercel-protection-bypass'] =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

// Smoke test optimization: faster timeouts for quick feedback
const isSmokeOnly = process.env.SMOKE_ONLY === '1';
const isCI = !!process.env.CI;
const isFullMatrix = process.env.E2E_FULL_MATRIX === '1';

const videoMode: 'off' | 'retain-on-failure' =
  isCI && isSmokeOnly ? 'off' : 'retain-on-failure';

const webServerCommand = process.env.DATABASE_URL
  ? 'pnpm run dev:local'
  : 'doppler run -- pnpm run dev:local';

function getRetries(): number {
  if (!isCI) return 0;
  return isSmokeOnly ? 1 : 2;
}

function getWorkers(): number | undefined {
  if (!isCI) return undefined;
  // GitHub Actions runners have 2 vCPUs - match that to avoid context switching
  // Using 4-8 workers causes thrashing and makes tests slower/flakier
  return 2;
}

export default defineConfig({
  testDir: './tests/e2e',
  // Exclude nightly tests - they run via playwright.config.nightly.ts on schedule
  testIgnore: ['**/nightly/**'],
  fullyParallel: true,
  forbidOnly: isCI,
  // Smoke tests: fewer retries for faster feedback; full suite: more resilience
  retries: getRetries(),
  // Smoke tests: more parallelism since tests are faster
  // Increased from 6 to 8 for smoke - tests are I/O-bound, not CPU-bound
  workers: getWorkers(),
  reporter: isCI
    ? [
        ['line'],
        ['html', { open: 'never' }],
        // JSON reporter for flakiness tracking
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : 'html',

  // Global timeout settings
  timeout: isSmokeOnly ? 30_000 : 60_000, // 30s for smoke, 60s for full
  expect: {
    timeout: isSmokeOnly ? 10_000 : 15_000, // 10s for smoke, 15s for full
    // Visual regression snapshot settings
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05, // 5% pixel difference allowed
      threshold: 0.2, // Per-pixel color threshold
      animations: 'disabled',
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
    },
  },

  // Snapshot directory configuration
  snapshotDir: './tests/e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    video: videoMode,
    // Faster navigation timeouts for smoke tests
    navigationTimeout: isSmokeOnly ? 15_000 : 30_000,
    actionTimeout: isSmokeOnly ? 10_000 : 15_000,
    // Add Vercel bypass header when secret is available (for staging/canary)
    ...(Object.keys(extraHTTPHeaders).length > 0 && { extraHTTPHeaders }),
  },

  projects: [
    // Setup project: authenticate once and save storageState
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      // Setup runs without storageState to create fresh auth
    },

    // Authenticated tests use storageState from setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use saved auth state for faster tests (created in global-setup.ts)
        // Tests will fall back to individual sign-ins if storageState doesn't exist
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // Only run Firefox in full-matrix workflow (weekly comprehensive testing)
    ...(isFullMatrix
      ? [
          {
            name: 'firefox',
            use: {
              ...devices['Desktop Firefox'],
              storageState: '.auth/user.json',
            },
            dependencies: ['setup'],
          },
        ]
      : []),
    // Keep WebKit for local testing only (skip in CI)
    ...(!isCI
      ? [
          {
            name: 'webkit',
            use: {
              ...devices['Desktop Safari'],
              storageState: '.auth/user.json',
            },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  // Only start web server if not in CI (when BASE_URL is not set)
  ...(isCI && process.env.BASE_URL
    ? {}
    : {
        webServer: {
          // Use dev:local to avoid doppler dependency when running locally
          // In CI with ephemeral DB, doppler is configured via environment
          command: webServerCommand,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3100',
            NEXT_DISABLE_TOOLBAR: '1',
          },
          url: 'http://localhost:3100',
          reuseExistingServer: !isCI,
          timeout: 120000, // Increased to 2min for slow Turbopack compilations
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),

  // Add global setup to handle React context issues
  globalSetup: require.resolve('./tests/global-setup.ts'),
});
