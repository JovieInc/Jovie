import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists
dotenv.config({ path: '.env.test' });

/**
 * Optimized Vitest Configuration
 *
 * Key optimizations:
 * - Sets test environment variables directly (avoids .env.test issues)
 * - Inlines testing library dependencies for faster loading
 * - Uses esbuild for faster test file compilation
 * - Pre-bundles common dependencies via optimizeDeps
 * - Maintains test isolation to prevent cross-contamination
 *
 * Note: Parallel execution (maxForks > 1) causes module resolution issues
 * with @jovie/ui package, so we use single fork for reliability.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],

    // Environment variables for tests
    env: {
      // Set a test encryption key to enable proper encryption tests
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      // Ensure tests run in test mode
      NODE_ENV: 'test',
    },

    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'node_modules/**',
      '.next/**',
    ],

    // Use forks pool for stability with module mocking
    // Note: Parallel execution (maxForks > 1) causes module resolution issues
    // with @jovie/ui package, so we use single fork for reliability
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },

    // Enable isolation to prevent mock conflicts between tests
    // Component tests need isolation for proper mock scoping
    isolate: true,

    // Coverage optimization - only enabled when explicitly requested
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

    // Timeouts balanced for reliability
    // Some tests (linktree/beacons) take ~3s intentionally for retry testing
    testTimeout: 10000, // 10s for reliability
    hookTimeout: 5000, // 5s for setup/teardown

    globals: true,

    // Removed maxConcurrency: 1 to allow full parallel execution

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
