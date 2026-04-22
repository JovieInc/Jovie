import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists
dotenv.config({ path: '.env.test' });

const isCI = process.env.CI === 'true';
const configuredMaxForks = process.env.VITEST_MAX_FORKS
  ? parseInt(process.env.VITEST_MAX_FORKS)
  : 8;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      'tests/e2e/**',
      'tests/eval/**',
      'tests/performance/**',
      'tests/product-screenshots/**',
      'node_modules/**',
      '.next/**',
    ],
    // Use forks pool to prevent JS heap OOM in worker threads (Vitest 4 style).
    // Local coverage runs are more stable when reusing one long-lived fork instead
    // of spawning a fresh worker late in a multi-thousand-test pass.
    pool: 'forks',
    minWorkers: 1,
    singleFork: !isCI,
    fileParallelism: isCI,
    // Use available CPUs in CI (up to 8 for faster execution), single fork locally for stability.
    maxWorkers: isCI ? Math.max(2, Math.floor(configuredMaxForks)) : 1,
    // Isolate tests to prevent cross-contamination but allow within-file parallelism
    isolate: true,
    // Coverage optimization
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '.next/**',
        'dist/**',
      ],
      // Coverage ratchet: prevents coverage from decreasing on main.
      // Baseline from latest generated coverage report:
      // branches 51.16%, functions 56.17%, lines 59.77%.
      // Keep thresholds 1 point below the measured baseline so follow-up work
      // can ratchet upward without blocking on tiny fluctuations.
      thresholds: {
        lines: 58,
        functions: 55,
        branches: 50,
      },
    },
    // Test timeout - 5s safety net (tests target <200ms)
    testTimeout: 5000,
    hookTimeout: 5000,
    teardownTimeout: isCI ? 5000 : 12000,
    globals: true,
    // Allow concurrent tests within each worker for better throughput.
    // CI can handle more concurrency; local coverage runs stay conservative.
    maxConcurrency: isCI ? 5 : 1,
  },
  server: {
    fs: {
      // Allow serving files from paths with spaces (Windows short-path expansion).
      allow: [path.resolve(__dirname, '../..'), 'C:/'],
      strict: false,
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
        find: /^@jovie\/ui\//,
        replacement: `${path.resolve(__dirname, '../../packages/ui')}/`,
      },
      {
        find: /^@jovie\/ui$/,
        replacement: path.resolve(__dirname, '../../packages/ui'),
      },
    ],
  },
  // Build optimizations
  build: {
    target: 'esnext',
    minify: false,
  },
});
