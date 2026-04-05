import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];

  if (arg === '--') {
    continue;
  }

  if (arg === 'run') {
    continue;
  }

  if (arg === '--config' || arg.startsWith('--config=')) {
    continue;
  }

  if (arg === '--shard' || arg.startsWith('--shard=')) {
    if (arg === '--shard') {
      index += 1;
    }
    continue;
  }

  args.push(arg);
}

const result = spawnSync('vitest', ['run', ...args], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
