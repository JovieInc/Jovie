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
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
