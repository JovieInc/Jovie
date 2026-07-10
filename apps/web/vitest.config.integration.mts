import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists
dotenv.config({ path: '.env.test' });

/**
 * Integration test config (JOV-4195 / GH #13931).
 *
 * Runs `tests/integration/**` against a real database (DATABASE_URL —
 * a Neon ephemeral branch in CI). This is the ONLY config that executes
 * the integration suites: vitest.config.fast.mts (merge gate) excludes
 * them, and vitest.config.ci.mts runs without a DATABASE_URL in the
 * nightly sonarcloud lane. Suites use describe.skipIf(!DATABASE_URL) so
 * the run degrades to skips rather than hard failures when no DB is
 * provisioned.
 *
 * CI lane: "Integration Tests (DB)" in .github/workflows/ci.yml —
 * risk-triggered on DB-relevant path changes, reusing the shared
 * neon-db ephemeral branch artifact.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
    pool: 'forks',
    // DB integration suites share one ephemeral branch — run serially to
    // avoid cross-file fixture interference.
    singleFork: true,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    isolate: true,
    // Real DB round-trips + drizzle migrate() in beforeAll need generous
    // budgets compared to the 5s unit-test defaults.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
    globals: true,
    maxConcurrency: 1,
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
  build: {
    target: 'esnext',
    minify: false,
  },
});
