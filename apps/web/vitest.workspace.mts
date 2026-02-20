import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { defineWorkspace } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkspace([
  './vitest.config.fast.mts',
  {
    plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        provider: 'playwright',
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
      setupFiles: ['./.storybook/vitest.setup.ts'],
    },
  },
]);
