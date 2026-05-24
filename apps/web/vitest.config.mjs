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
const workspaceRoot = realRoot.includes(`${path.sep}.stryker-tmp${path.sep}`)
  ? path.resolve(realRoot, '../../../..')
  : path.resolve(realRoot, '../..');

// Load environment variables from .env.test if it exists
dotenv.config({ path: path.resolve(realRoot, '.env.test') });

export default defineConfig({
  root: realRoot,
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(realRoot, 'tests/setup.ts')],
    exclude: [
      'tests/e2e/**',
      'tests/performance/**',
      'node_modules/**',
      '.next/**',
      '.stryker-tmp/**',
    ],
    // Use forks pool to prevent JS heap OOM in worker threads
    pool: 'forks',
    isolate: true,
    singleFork: false,
    maxWorkers: process.env.CI ? 2 : undefined,
    minWorkers: 1,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    // Coverage optimization
    coverage: {
      enabled: false,
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
    reporters: process.env.CI ? ['basic'] : ['default'],
    globals: true,
  },
  resolve: {
    alias: [
      {
        find: /^@\/app\/app\//,
        replacement: `${path.resolve(realRoot, './app/app')}/`,
      },
      {
        find: /^@\/app\/api\//,
        replacement: `${path.resolve(realRoot, './app/api')}/`,
      },
      {
        find: /^@\/app\/\(marketing\)\//,
        replacement: `${path.resolve(realRoot, './app/(marketing)')}/`,
      },
      {
        find: /^@\/app\/\(shell\)\//,
        replacement: `${path.resolve(realRoot, './app/app/(shell)')}/`,
      },
      {
        find: /^@\/app\//,
        replacement: `${path.resolve(realRoot, './app')}/`,
      },
      {
        find: /^@\/features\//,
        replacement: `${path.resolve(realRoot, './components/features')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(realRoot, './')}/`,
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
  // Build optimizations
  build: {
    target: 'esnext',
    minify: false,
  },
});
