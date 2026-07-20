import { defineConfig, type UserConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.mts';

const base = baseConfig as UserConfig;

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/eval/knowledge-accuracy.eval.ts'],
    exclude: ['node_modules/**', '.next/**', '.stryker-tmp/**'],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
