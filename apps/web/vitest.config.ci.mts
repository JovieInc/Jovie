import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists
dotenv.config({ path: '.env.test' });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'node_modules/**',
      '.next/**',
    ],
    // Use forks pool to prevent JS heap OOM in worker threads (Vitest 4 style)
    // CI runners have 7GB RAM - safe to use more workers for parallelization
    pool: 'forks',
    minWorkers: 1,
    // Use available CPUs in CI (up to 8 for faster execution), single fork locally for stability
    maxWorkers: process.env.CI
      ? Math.max(
          2,
          Math.floor(
            process.env.VITEST_MAX_FORKS
              ? parseInt(process.env.VITEST_MAX_FORKS)
              : 8
          )
        )
      : 1,
    // Isolate tests to prevent cross-contamination but allow within-file parallelism
    isolate: true,
    // Coverage optimization
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '.next/**',
        'dist/**',
      ],
    },
    // Test timeout - reduced from 30s to 10s (most tests should be <200ms)
    testTimeout: 10000,
    hookTimeout: 10000,
    globals: true,
    // Allow concurrent tests within each worker for better throughput
    // CI can handle more concurrency; local stays conservative
    maxConcurrency: process.env.CI ? 5 : 1,
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
        find: /^@\/app\//,
        replacement: `${path.resolve(__dirname, './app/app')}/`,
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
