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
    exclude: ['tests/e2e/**', 'tests/performance/**', 'node_modules/**', '.next/**'],
    // Use forks pool to prevent JS heap OOM in worker threads
    pool: 'forks',
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
    // Reduce overhead by limiting concurrent tests per worker
    maxConcurrency: 5,
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
