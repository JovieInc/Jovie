import { spawnSync } from 'node:child_process';

const shouldUseWebpack =
  process.env.CI === 'true' ||
  process.env.VERCEL === '1' ||
  typeof process.env.VERCEL_ENV === 'string';

const args = shouldUseWebpack
  ? ['build', '--webpack']
  : ['build', '--turbopack'];

const result = spawnSync('next', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
