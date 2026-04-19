import { spawnSync } from 'node:child_process';

const shouldUseWebpack =
  process.env.CI === 'true' ||
  process.env.VERCEL === '1' ||
  typeof process.env.VERCEL_ENV === 'string';

const hasExplicitHeapLimit = /\b--max-old-space-size=\d+\b/.test(
  process.env.NODE_OPTIONS ?? ''
);
const defaultHeapMb = shouldUseWebpack ? '12288' : '8192';
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
