import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

const realRoot = (() => {
  try {
    return fs.realpathSync(path.resolve(__dirname));
  } catch {
    return path.resolve(__dirname);
  }
})();

const workspaceRoot = path.resolve(realRoot, '../..');

dotenv.config({ path: path.resolve(realRoot, '.env.test') });

export default defineConfig({
  root: realRoot,
  plugins: [react()],
  server: {
    fs: {
      allow: [realRoot, workspaceRoot, '..', 'C:/'],
      strict: false,
    },
  },
  test: {
    setupFiles: [path.resolve(realRoot, 'tests/setup-optimized.ts')],
    environment: 'jsdom',
    env: {
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      NODE_ENV: 'test',
    },
    include: ['tests/eval/golden/**/*.ci.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.stryker-tmp/**'],
    pool: 'forks',
    isolate: true,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 10_000,
    reporters:
      process.env.CI === 'true'
        ? [['default', { summary: false }]]
        : ['default'],
    globals: false,
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
        find: /^@jovie\/auth-routing$/,
        replacement: path.resolve(workspaceRoot, 'packages/auth-routing'),
      },
      {
        find: /^@jovie\/auth-routing\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/auth-routing')}/`,
      },
      {
        find: /^@jovie\/ui\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/ui')}/`,
      },
      {
        find: /^@jovie\/ui$/,
        replacement: path.resolve(workspaceRoot, 'packages/ui'),
      },
    ],
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },
});
