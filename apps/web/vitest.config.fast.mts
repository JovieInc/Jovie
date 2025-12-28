import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Optimized Vitest Configuration for Fast Test Execution
 *
 * Key optimizations for quick feedback (<30s target):
 * - Runs only lightweight lib/utility tests (no heavy React components)
 * - Uses node environment (faster than jsdom) for pure logic tests
 * - Uses forks pool with single fork (threads pool causes @jovie/ui resolution issues)
 * - Aggressive timeouts to catch slow tests
 * - Excludes component tests and tests requiring React/DOM
 * - Disables coverage for speed
 *
 * Note: Parallel execution (maxForks > 1 or threads pool) causes module resolution
 * issues with @jovie/ui package ("Failed to resolve import react/jsx-dev-runtime"),
 * so we use single fork for reliability while optimizing other areas.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Use minimal setup file for fast tests (no DOM dependencies)
    setupFiles: ['./tests/setup-fast.ts'],

    // Use node environment for pure logic tests (faster than jsdom)
    // Tests that need DOM should use the main config
    environment: 'node',

    // Environment variables for tests
    env: {
      // Set a test encryption key to enable proper encryption tests
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      // Ensure tests run in test mode
      NODE_ENV: 'test',
    },

    // Focus on fast, lightweight tests only
    // Runs lib tests (pure logic) and excludes tests requiring React/DOM
    include: ['tests/lib/**/*.test.ts'],

    // Exclude slow test categories, component tests, and tests requiring React/DOM
    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'tests/integration/**',
      'tests/bench/**',
      'tests/components/**',
      'tests/lib/hooks/**', // React hooks require DOM
      'tests/lib/stripe/**', // Uses React context/hooks
      'tests/lib/monitoring/web-vitals.test.ts', // Browser-only (known failing)
      // Tests that require window/document (DOM)
      'tests/lib/deep-links.test.ts',
      'tests/lib/environment-validation.test.ts',
      'tests/lib/integrations.test.ts',
      'tests/lib/admin/mercury-metrics.test.ts',
      'tests/lib/admin/roles.test.ts',
      'tests/lib/admin/stripe-metrics.test.ts',
      'tests/lib/ingestion/processor.test.ts',
      'tests/lib/utils/url-encryption.test.ts',
      'node_modules/**',
      '.next/**',
    ],

    // Use forks pool for stability with module mocking
    // Note: threads pool causes module resolution issues with @jovie/ui package
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },

    // Aggressive timeouts to catch slow tests
    testTimeout: 5000, // 5s for fast feedback
    hookTimeout: 2000, // 2s for setup/teardown

    // Disable coverage for speed (enable separately with npm run test:coverage)
    coverage: {
      enabled: false,
    },

    // Enable isolation to prevent mock conflicts between tests
    isolate: true,

    // Use minimal reporter for speed (matches 'basic' behavior)
    reporters: [['default', { summary: false }]],

    // Disable file watching for single run
    watch: false,

    // Enable globals for cleaner test syntax
    globals: true,

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
