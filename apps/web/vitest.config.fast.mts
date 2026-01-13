import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists to keep parity with the
// standard configuration while using the optimized defaults locally.
dotenv.config({ path: '.env.test' });

/**
 * Optimized Vitest Configuration for Fast Test Execution
 *
 * Configured for sub-200ms p95 performance with minimal overhead.
 * Uses optimized setup file and aggressive performance settings.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Use optimized setup file
    setupFiles: ['./tests/setup-optimized.ts'],

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
      'tests/audit/**',
      'tests/performance/**',
      'tests/integration/**',
      'node_modules/**',
      '.next/**',
    ],

    // Performance optimizations
    // Use forks to keep memory bounded across the full suite
    // (threads can retain memory across many test files in CI-like runs).
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },

    // Aggressive timeouts to catch slow tests
    testTimeout: 5000, // 5s instead of 30s
    hookTimeout: 2000, // 2s for setup/teardown

    // Disable coverage for speed (enable separately if needed)
    coverage: {
      enabled: false,
    },

    // Enable isolation to prevent mock conflicts between tests
    // Component tests need isolation for proper mock scoping
    isolate: true,

    // Reduce reporter overhead
    reporters: [
      [
        'default',
        {
          summary: false,
        },
      ],
    ],

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
