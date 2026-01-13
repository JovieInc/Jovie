import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { globSync } from 'glob';

function runVitestShard(name, patterns, extraArgs = []) {
  const vitestBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vitest.cmd' : 'vitest'
  );

  const args = ['run', '--config=vitest.config.mts', ...extraArgs, ...patterns];

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
runVitestShard('unit-lib', ['tests/unit/lib']);
runVitestShard('unit-api', ['tests/unit/api']);

// Run all remaining unit tests (excluding the already-covered api/lib buckets)
// as small, explicit file shards. This avoids Vitest globbing / scanning the full
// tree in a single process, which has been hitting the ~4GB heap limit.
const unitRestFiles = globSync('tests/unit/**/*.test.{ts,tsx}', {
  ignore: ['tests/unit/lib/**', 'tests/unit/api/**'],
})
  .filter(file => file !== 'tests/unit/links/useLinksPersistence.test.ts')
  .sort();

const unitRestFilesPerShard = 5;
const unitRestShardCount = Math.max(
  1,
  Math.ceil(unitRestFiles.length / unitRestFilesPerShard)
);

for (let shardIndex = 0; shardIndex < unitRestShardCount; shardIndex += 1) {
  const start = shardIndex * unitRestFilesPerShard;
  const files = unitRestFiles.slice(start, start + unitRestFilesPerShard);
  if (files.length === 0) continue;

  runVitestShard(`unit-rest-${shardIndex + 1}of${unitRestShardCount}`, files);
}

runVitestShard('components', ['tests/components']);
runVitestShard('contracts', ['tests/contracts']);
runVitestShard('lib', ['tests/lib', 'lib/**/*.test.ts']);
runVitestShard('root', ['tests/database.test.ts']);
