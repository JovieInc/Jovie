#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const WEB_TYPECHECK_STAGED_FILE = /^apps\/web\/.+\.(?:ts|tsx)$/;
const DRY_RUN = process.env.JOVIE_TURBO_WARM_PRECOMMIT_DRY_RUN === '1';

const stagedFiles = readStagedFiles();

if (!stagedFiles.some(file => WEB_TYPECHECK_STAGED_FILE.test(file))) {
  console.log(
    '[turbo-warm-precommit-cache] skipped; no staged apps/web TypeScript files.'
  );
  process.exit(0);
}

const warmArgs = [
  'scripts/turbo-local.mjs',
  'typecheck',
  '--filter=@jovie/web',
  '--cache=local:rw,remote:r',
  '--output-logs=errors-only',
];

console.log(
  '[turbo-warm-precommit-cache] warming @jovie/web typecheck cache before lint-staged.'
);

if (DRY_RUN) {
  console.log(
    `[turbo-warm-precommit-cache] dry run: node ${warmArgs.join(' ')}`
  );
  process.exit(0);
}

const result = spawnSync('node', warmArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  timeout: Number(process.env.JOVIE_TURBO_WARM_PRECOMMIT_TIMEOUT_MS ?? 300000),
  shell: process.platform === 'win32',
});

if (result.error) {
  console.warn(
    `[turbo-warm-precommit-cache] warm skipped; failed to start typecheck: ${result.error.message}`
  );
  process.exit(0);
}

if (result.signal) {
  console.warn(
    `[turbo-warm-precommit-cache] warm skipped; typecheck exited via signal ${result.signal}.`
  );
  process.exit(0);
}

if (result.status !== 0) {
  console.warn(
    `[turbo-warm-precommit-cache] warm skipped; typecheck exited ${result.status}.`
  );
}

process.exit(0);

function readStagedFiles() {
  const result = spawnSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    }
  );

  if (result.status !== 0) {
    const message =
      result.stderr?.trim() ||
      result.error?.message ||
      'unknown git diff failure';
    console.warn(
      `[turbo-warm-precommit-cache] skipped; could not inspect staged files: ${message}`
    );
    return [];
  }

  return result.stdout
    .split('\n')
    .map(file => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}
