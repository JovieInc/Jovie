import { defineConfig, type UserConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.mts';

const base = baseConfig as UserConfig;
// The unit config splits files into node/jsdom projects whose include lists
// would replace the single-file selection below; this lane runs one file.
const { projects: _unitEnvironmentProjects, ...baseTest } = base.test ?? {};

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    include: ['tests/eval/knowledge-accuracy.eval.ts'],
    exclude: ['node_modules/**', '.next/**', '.stryker-tmp/**'],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
