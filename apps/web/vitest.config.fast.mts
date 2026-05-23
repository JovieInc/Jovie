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
      'tests/e2e/**',
      'tests/eval/**',
      'tests/audit/**',
      'tests/performance/**',
      'tests/integration/**',
      'tests/**/*.nightly.test.ts',
      'tests/product-screenshots/**',
      'node_modules/**',
      '.next/**',
      '.stryker-tmp/**',
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
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: 5000,

    ...changedSuiteStabilityConfig,

    // Coverage disabled by default for speed (enable with --coverage flag)
    //
    // Thresholds are part of the risk-based testing strategy. See
    // docs/TEST_RISK_REGISTER.md for the surface taxonomy and target_coverage
    // values. Phase 0 sets thresholds at current baselines (warnings via the
    // heatmap, not vitest errors). Phase 2 ratchets per-glob thresholds to the
    // register targets and lets vitest --coverage fail CI on regression.
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
      // Global thresholds are intentionally low — the heatmap is the
      // enforcement mechanism in Phase 0. Per-glob thresholds below track
      // critical surfaces (raised in Phase 2).
      thresholds: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
        perFile: false,
        // Critical surfaces — Phase 2 will raise these to the targets in
        // docs/TEST_RISK_REGISTER.md (90, 95, 85, etc.).
        'lib/entitlements/**/*.ts': { branches: 0, lines: 0 },
        'app/api/stripe/webhooks/**/*.ts': { branches: 0, lines: 0 },
        'app/api/webhooks/**/*.ts': { branches: 0, lines: 0 },
        'app/api/dev/test-auth/**/*.ts': { branches: 0, lines: 0 },
        'lib/auth/test-mode.ts': { branches: 0, lines: 0 },
      },
    },

    // Reduce reporter overhead - basic was removed in vitest 4, use default with summary:false
    // JUnit reporter in CI for Codecov Test Analytics ingestion
    reporters: isCI
      ? [
          ['default', { summary: false }],
          ['junit', { outputFile: 'test-report.junit.xml' }],
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
