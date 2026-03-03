import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: '.env.test' });

// No-op: avoid Windows 8.3 short-path / Vitest 4 /@fs/ resolution issue.
// The setup content is minimal (env vars + matchers) and is safe to skip for
// pure API unit tests that do not render React components.

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: [],
    environment: 'jsdom',
    env: {
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      NODE_ENV: 'test',
    },
    include: ['tests/unit/api/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
    ],
    pool: 'forks',
    minWorkers: 1,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,
    watch: false,
    globals: false,
    server: {
      deps: {
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
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@testing-library/react',
      '@testing-library/jest-dom',
    ],
  },
});
