import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type UserConfig } from 'vitest/config';
import baseConfig from './vitest.config.fast.mts';

const base = baseConfig as UserConfig;
const nodeFiles = JSON.parse(
  readFileSync(
    path.resolve(__dirname, 'tests/node-test-files.manifest'),
    'utf8'
  )
).files as string[];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'tests/setup-dom.ts')],
    exclude: [...(base.test?.exclude ?? []), ...nodeFiles],
  },
});
