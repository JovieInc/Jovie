/**
 * Minimal Vitest Configuration for Pure Unit Tests
 *
 * This config skips the testing-library setup file for tests that
 * don't need React component testing (e.g., pure function tests).
 */
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Skip the setup file that requires testing-library
    setupFiles: [],
    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'tests/integration/**',
      'node_modules/**',
      '.next/**',
    ],
    include: ['tests/unit/lib/sentry/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 10000,
    hookTimeout: 5000,
    globals: true,
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
  build: {
    target: 'esnext',
    minify: false,
  },
});
