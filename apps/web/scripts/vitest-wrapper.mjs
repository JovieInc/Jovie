import { spawnSync } from 'node:child_process';

// pnpm sometimes forwards an extra leading "--" to scripts (especially in CI),
// which causes Vitest to stop parsing flags (treating them as test filters).
// Strip that sentinel so flags like `--changed` and `--exclude` still work.
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const result = spawnSync('vitest', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
