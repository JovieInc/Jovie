import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.ci.mts';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/integration/**/*.test.ts'],
      singleFork: true,
      fileParallelism: false,
      passWithNoTests: false,
      testTimeout: 30_000,
      hookTimeout: 120_000,
      reporters: [
        'default',
        ['junit', { outputFile: 'test-report.db-integration.junit.xml' }],
      ],
    },
  })
);
