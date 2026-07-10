import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: [
      'lib/__tests__/**/*.test.mjs',
      'gate-ladder/**/*.test.mjs',
      'hermes/lib/__tests__/**/*.test.ts',
    ],
    name: 'workspace-scripts',
  },
});
