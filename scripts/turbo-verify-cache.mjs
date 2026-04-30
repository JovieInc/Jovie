import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'node',
  [
    'scripts/turbo-local.mjs',
    'typecheck',
    '--filter=@jovie/ui',
    '--cache=local:,remote:r',
    '--output-logs=hash-only',
  ],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  }
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
process.stdout.write(output);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!output.includes('Remote caching enabled')) {
  console.error(
    '[turbo-verify-cache] Expected Turbo remote caching to be enabled.'
  );
  process.exit(1);
}

if (!/Cached:\s+1 cached,\s+1 total/.test(output)) {
  console.error(
    '[turbo-verify-cache] Expected @jovie/ui#typecheck to be served from remote cache.'
  );
  process.exit(1);
}

console.log('[turbo-verify-cache] Remote cache read verified.');
