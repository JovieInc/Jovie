import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

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

    // Exclude slow test categories
    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'tests/integration/**',
      'node_modules/**',
      // Temporarily exclude known slow tests during optimization
      'tests/lib/database-performance.test.ts',
    ],

    // Performance optimizations
    pool: 'threads', // Use threads instead of forks for better performance
    poolOptions: {
      threads: {
        // Optimize thread pool
        minThreads: 1,
        maxThreads: 4,
        useAtomics: true,
      },
    },

    // Aggressive timeouts to catch slow tests
    testTimeout: 5000, // 5s instead of 30s
    hookTimeout: 2000, // 2s for setup/teardown

    // Disable coverage for speed (enable separately if needed)
    coverage: {
      enabled: false,
    },

    // Optimize test isolation
    isolate: false, // Disable isolation for speed (use with caution)

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
    alias: {
      '@': path.resolve(__dirname, './'),
    },
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
