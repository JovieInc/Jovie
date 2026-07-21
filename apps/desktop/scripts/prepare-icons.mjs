#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');

const result = spawnSync(
  'pnpm',
  ['exec', 'tsx', 'scripts/generate-brand-assets.ts'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    // Windows can only resolve pnpm.cmd through the shell.
    shell: process.platform === 'win32',
  }
);

if (result.error) {
  throw result.error;
}

if (result.signal) {
  // Re-raise so the parent observes the same signal termination.
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
