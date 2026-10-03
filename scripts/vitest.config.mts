import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.mjs', 'gate-ladder/**/*.test.mjs'],
    name: 'workspace-scripts',
    // Script contracts spawn git/node/bash. The pre-push structural lane runs
    // them on loaded developer Macs, where 5s timed out green suites (JOV-7707).
    testTimeout: 30_000,
  },
});
