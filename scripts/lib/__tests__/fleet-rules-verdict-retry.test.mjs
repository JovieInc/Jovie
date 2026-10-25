import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../../..');

// Runs the real verdict script against a fake pr-fleet-rules.mjs that exits
// with each code in turn, and a fake api client that answers every read empty.
function verdict(codes, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-verdict-'));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, '.github/scripts'), { recursive: true });
  cpSync(
    join(root, '.github/scripts/fleet-rules-verdict.sh'),
    join(dir, '.github/scripts/fleet-rules-verdict.sh')
  );
  writeFileSync(join(dir, 'count'), '0');
  writeFileSync(
    join(dir, 'scripts/pr-fleet-rules.mjs'),
    `import { readFileSync, writeFileSync } from 'node:fs';
const n = Number(readFileSync(${JSON.stringify(join(dir, 'count'))}, 'utf8'));
writeFileSync(${JSON.stringify(join(dir, 'count'))}, String(n + 1));
process.exit(${JSON.stringify(codes)}[Math.min(n, ${codes.length - 1})]);
`
  );
  writeFileSync(join(dir, 'cli.mjs'), '');
  chmodSync(join(dir, 'cli.mjs'), 0o755);
  const done = spawnSync('bash', ['.github/scripts/fleet-rules-verdict.sh'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      API_CLIENT: join(dir, 'cli.mjs'),
      HEAD_SHA: 'a'.repeat(40),
      GH_TOKEN: 'x',
      REPOSITORY: 'JovieInc/Jovie',
      FLEET_DEFERRED_BACKOFF_STEP_S: '0',
      ...env,
    },
  });
  const runs = Number(readFileSync(join(dir, 'count'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return { status: done.status, runs };
}

test('a deferred read is retried and a later pass is the verdict', () => {
  assert.deepEqual(verdict([75, 75, 0]), { status: 0, runs: 3 });
});

test('a policy failure is decisive and is not retried', () => {
  assert.deepEqual(verdict([1, 0]), { status: 1, runs: 1 });
});

test('a read that stays deferred stops at the retry cap and still reports 75', () => {
  assert.deepEqual(verdict([75]), { status: 75, runs: 4 });
  assert.deepEqual(verdict([75], { FLEET_DEFERRED_RETRIES: '1' }), {
    status: 75,
    runs: 2,
  });
});
