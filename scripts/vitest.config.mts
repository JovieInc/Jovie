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
    // 30s still timed out git-archive and web-runner startup on a loaded
    // pre-push. 60s is the suite budget. The web-runner case sets its own.
    testTimeout: 60_000,
  },
});
