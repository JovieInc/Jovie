import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

const webRoot = (() => {
  try {
    return fs.realpathSync(path.resolve(__dirname, '../..', '..'));
  } catch {
    return path.resolve(__dirname, '../..', '..');
  }
})();

const workspaceRoot = path.resolve(webRoot, '../..');

dotenv.config({ path: path.resolve(webRoot, '.env.test') });

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    fs: {
      allow: [webRoot, workspaceRoot, '..', 'C:/'],
      strict: false,
    },
  },
  test: {
    setupFiles: [path.resolve(webRoot, 'tests/setup-optimized.ts')],
    environment: 'jsdom',
    env: {
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      NODE_ENV: 'test',
    },
    include: ['tests/eval/golden/**/*.real.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.stryker-tmp/**'],
    pool: 'forks',
    isolate: true,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 45_000,
    hookTimeout: 45_000,
    teardownTimeout: 45_000,
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
        replacement: `${path.resolve(webRoot, './app/app')}/`,
      },
      {
        find: /^@\/app\/api\//,
        replacement: `${path.resolve(webRoot, './app/api')}/`,
      },
      {
        find: /^@\/app\/\(marketing\)\//,
        replacement: `${path.resolve(webRoot, './app/(marketing)')}/`,
      },
      {
        find: /^@\/app\/\(shell\)\//,
        replacement: `${path.resolve(webRoot, './app/app/(shell)')}/`,
      },
      {
        find: /^@\/app\//,
        replacement: `${path.resolve(webRoot, './app')}/`,
      },
      {
        find: /^@\/features\//,
        replacement: `${path.resolve(webRoot, './components/features')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(webRoot, './')}/`,
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
