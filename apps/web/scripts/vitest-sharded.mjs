import { spawnSync } from 'node:child_process';
import path from 'node:path';

function runVitestShard(name, patterns) {
  const vitestBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
  );

  const args = ['run', '--config=vitest.config.mts', ...patterns];

  // Keep output readable in CI/local logs
  process.stdout.write(`\n[vitest-sharded] Running shard: ${name}\n`);

  const result = spawnSync(vitestBin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write(`\n[vitest-sharded] Shard failed: ${name}\n`);
    process.exit(result.status ?? 1);
  }
}

// Run the suite in smaller processes to avoid heap growth/OOM.
// Vitest accepts file patterns as positional args after options.
runVitestShard('unit+components+contracts', [
  'tests/unit',
  'tests/components',
  'tests/contracts',
  'tests/database.test.ts',
]);
runVitestShard('lib', ['tests/lib', 'lib/**/*.test.ts']);

