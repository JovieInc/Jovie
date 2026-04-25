import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.fast.mts';

const baseExclude = Array.isArray(baseConfig.test?.exclude)
  ? baseConfig.test.exclude.filter(pattern => pattern !== 'tests/integration/**')
  : [];

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: baseExclude,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    teardownTimeout: 20_000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
