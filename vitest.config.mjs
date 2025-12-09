import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Load environment variables from .env.test if it exists
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'tests/performance/**', 'node_modules/**', '.next/**'],
    // Use forks pool to prevent JS heap OOM in worker threads
    pool: 'forks',
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
    // Test timeout - increased for database operations
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@jovie/ui': path.resolve(__dirname, './packages/ui'),
    },
  },
  // Build optimizations
  build: {
    target: 'esnext',
    minify: false,
  },
});
