import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.ci.mts';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/integration/**/*.test.ts'],
      exclude: ['node_modules/**', '.next/**'],
      pool: 'forks',
      minWorkers: 1,
      maxWorkers: 1,
      singleFork: true,
      fileParallelism: false,
      maxConcurrency: 1,
      isolate: true,
      passWithNoTests: false,
      testTimeout: 30_000,
      hookTimeout: 120_000,
      teardownTimeout: 30_000,
      reporters: [
        'default',
        ['junit', { outputFile: 'test-report.db-integration.junit.xml' }],
      ],
    },
  })
);
