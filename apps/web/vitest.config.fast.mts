import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Resolve the real filesystem path (handles Windows short-name paths like TIMWHI~1)
// so that Vite's @fs handler can locate files when the path contains spaces.
const realRoot = (() => {
  try {
    return fs.realpathSync(path.resolve(__dirname));
  } catch {
    return path.resolve(__dirname);
  }
})();
const workspaceRoot = realRoot.includes(`${path.sep}.stryker-tmp${path.sep}`)
  ? path.resolve(realRoot, '../../../..')
  : path.resolve(realRoot, '../..');

// Load environment variables from .env.test if it exists to keep parity with the
// standard configuration while using the optimized defaults locally.
dotenv.config({ path: path.resolve(realRoot, '.env.test') });

// Detect CI environment
const isCI = process.env.CI === 'true';
const isChangedRun = process.argv.includes('--changed');
const isCoverageRun = process.argv.includes('--coverage');

// Changed-suite runs can fan out many short-lived workers on parity branches,
// which increases startup churn and causes timeout cascades under aggregate load.
// Keep this mode deterministic by running in a single long-lived fork with
// slightly higher global timeouts so only genuinely slow tests fail.
const changedSuiteStabilityConfig = isChangedRun
  ? {
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      maxConcurrency: 1,
      testTimeout: 12_000,
      hookTimeout: 12_000,
      teardownTimeout: 12_000,
    }
  : {};

/**
 * Optimized Vitest Configuration for Fast Test Execution
 *
 * Configured for sub-200ms p95 performance with minimal overhead.
 * Uses optimized setup file and aggressive performance settings.
 */
export default defineConfig({
  root: realRoot,
  plugins: [react()],
  // Allow Vite's @fs handler to serve files from the real path (handles
  // Windows short-name paths like TIMWHI~1 that contain spaces when expanded).
  server: {
    fs: {
      allow: [realRoot, workspaceRoot, '..', 'C:/'],
      strict: false,
    },
  },
  test: {
    // Use optimized setup file (resolved to real path for Windows compatibility)
    setupFiles: [path.resolve(realRoot, 'tests/setup-optimized.ts')],

    // Optimized environment settings
    environment: 'jsdom',

    // Environment variables for tests
    env: {
      // Set a test encryption key to enable proper encryption tests
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      // Ensure tests run in test mode
      NODE_ENV: 'test',
    },

    // Exclude slow test categories
    exclude: [
      // These suites use Node's built-in test runner and are exercised by the
      // repository's Node test lane, not Vitest's browser-oriented pipeline.
      'scripts/atomic-issue-output.test.mjs',
      'scripts/design-verify-output.test.mjs',
      'tests/e2e/**',
      'tests/eval/**',
      'tests/audit/**',
      'tests/performance/**',
      'tests/integration/**',
      'tests/**/*.nightly.test.ts',
      'tests/product-screenshots/**',
      'tests/visual-qa/**',
      // Temp Playwright comparison trees created by the artifact-secret guard.
      '.artifact-comparison-*/**',
      'node_modules/**',
      '.next/**',
      '.stryker-tmp/**',
      // Coverage runs instrument product code; this spec launches Chromium and
      // was failing the nightly heatmap for months (no browsers on that job).
      ...(isCoverageRun
        ? ['tests/unit/ci/playwright-artifact-secrets.test.ts']
        : []),
    ],

    // Performance optimizations
    // Use forks for better memory isolation (Vitest 4 style)
    pool: 'forks',
    isolate: true,
    singleFork: isChangedRun,
    // CI stability: reduce memory pressure
    maxWorkers: isCI ? 2 : undefined,
    minWorkers: 1,
    fileParallelism: !isCI,
    maxConcurrency: isCI ? 1 : undefined,

    // Timeouts
    // Serial CI runs trade fan-out for determinism, so allow the same bounded
    // headroom as changed-suite runs while preserving fast local feedback.
    testTimeout: isCI ? 12_000 : 5000,
    hookTimeout: isCI ? 12_000 : 5000,
    teardownTimeout: isCI ? 12_000 : 5000,

    ...changedSuiteStabilityConfig,

    // Coverage disabled by default for speed (enable with --coverage flag).
    // Merge-queue unit shards stay coverage-off; the nightly heatmap is the
    // collection lane. Per-glob floors are last measured snapshot (2026-05-10)
    // minus 3pp so `vitest --coverage` can fail closed on critical-surface
    // decay. Register targets (90/95/85) remain the ratchet destination.
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '.next/**',
        'dist/**',
        '**/__generated__/**',
        '**/*.gen.ts',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
      ],
      // Global floors stay 0: the fast config is the merge-queue unit path
      // and must not collect coverage. Per-glob floors apply when `--coverage`
      // is passed (nightly `test:coverage`).
      thresholds: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
        perFile: false,
        'lib/entitlements/**/*.ts': { branches: 68, lines: 71 },
        'app/api/stripe/webhooks/**/*.ts': { branches: 79, lines: 79 },
        'app/api/webhooks/**/*.ts': { branches: 42, lines: 48 },
        'app/api/dev/test-auth/**/*.ts': { branches: 74, lines: 85 },
        'lib/auth/test-mode.ts': { branches: 74, lines: 85 },
      },
    },

    // Reduce reporter overhead - basic was removed in vitest 4, use default with summary:false
    // JUnit reporter in CI for Codecov Test Analytics ingestion.
    // The per-reporter outputFile OVERRIDES the CLI --outputFile flag in Vitest 4,
    // so sharded CI runs (`--outputFile=test-report.5-10.junit.xml`) all wrote the
    // same default name that the workflow upload glob never matched (JOV: #17071).
    // Read the shard path from the environment instead; the workflow exports it.
    reporters: isCI
      ? [
          ['default', { summary: false }],
          [
            'junit',
            {
              outputFile:
                process.env.VITEST_JUNIT_OUTPUT_FILE ?? 'test-report.junit.xml',
            },
          ],
        ]
      : ['default'],

    // Optimize file watching
    watch: false,

    // Disable unnecessary features for speed
    globals: false,

    // Optimize dependency handling
    server: {
      deps: {
        // Inline dependencies for faster loading
        inline: ['@testing-library/react', '@testing-library/jest-dom'],
      },
    },
  },

  resolve: {
    alias: [
      {
        find: /^@\/app\/app\//,
        replacement: `${path.resolve(__dirname, './app/app')}/`,
      },
      {
        find: /^@\/app\/api\//,
        replacement: `${path.resolve(__dirname, './app/api')}/`,
      },
      {
        find: /^@\/app\/\(marketing\)\//,
        replacement: `${path.resolve(__dirname, './app/(marketing)')}/`,
      },
      {
        find: /^@\/app\/\(shell\)\//,
        replacement: `${path.resolve(__dirname, './app/app/(shell)')}/`,
      },
      {
        find: /^@\/app\//,
        replacement: `${path.resolve(__dirname, './app')}/`,
      },
      {
        find: /^@\/features\//,
        replacement: `${path.resolve(__dirname, './components/features')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, './')}/`,
      },
      {
        find: /^@jovie\/auth-routing$/,
        replacement: path.resolve(workspaceRoot, 'packages/auth-routing'),
      },
      {
        find: /^@jovie\/auth-routing\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/auth-routing')}/`,
      },
      {
        find: /^@jovie\/ui\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/ui')}/`,
      },
      {
        find: /^@jovie\/ui$/,
        replacement: path.resolve(workspaceRoot, 'packages/ui'),
      },
    ],
  },

  // Build optimizations for test files
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@testing-library/react',
      '@testing-library/jest-dom',
    ],
  },
});
