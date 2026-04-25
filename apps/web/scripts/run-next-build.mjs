import { spawnSync } from 'node:child_process';

const shouldUseWebpack = process.env.FORCE_WEBPACK_BUILD === '1';

const hasExplicitHeapLimit = /\b--max-old-space-size=\d+\b/.test(
  process.env.NODE_OPTIONS ?? ''
);
const defaultHeapMb = shouldUseWebpack ? '14336' : '8192';
const args = shouldUseWebpack
  ? ['build', '--webpack']
  : ['build', '--turbopack'];
const env = hasExplicitHeapLimit
  ? process.env
  : {
      ...process.env,
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${defaultHeapMb}`.trim(),
    };

const result = spawnSync('next', args, {
  stdio: 'inherit',
  shell: true,
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const shouldSkipStandaloneSync =
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_SKIP_STANDALONE_ASSET_SYNC === 'true';

if (!shouldSkipStandaloneSync) {
  const syncResult = spawnSync('node', ['scripts/sync-standalone-assets.mjs'], {
    stdio: 'inherit',
    shell: true,
    env,
  });

  if (syncResult.status !== 0) {
    process.exit(syncResult.status ?? 1);
  }
}
