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
function verdict(codes, env = {}, recovery) {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-verdict-'));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, '.github/scripts'), { recursive: true });
  cpSync(
    join(root, '.github/scripts/fleet-rules-verdict.sh'),
    join(dir, '.github/scripts/fleet-rules-verdict.sh')
  );
  cpSync(
    join(root, '.github/scripts/fleet-rules-rerun.sh'),
    join(dir, '.github/scripts/fleet-rules-rerun.sh')
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
  const calls = join(dir, 'calls.jsonl');
  writeFileSync(calls, '');
  writeFileSync(
    join(dir, 'cli.mjs'),
    recovery
      ? `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const endpoint = args.find(arg => arg.startsWith('repos/')) ?? '';
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ endpoint, post: args.includes('POST') }) + '\\n');
if (endpoint.includes('/workflows/source-validation.yml/runs?')) console.log('40966352433');
else if (endpoint.includes('/runs/40966352433/jobs?')) console.log(${JSON.stringify(String(recovery.onlyReady ?? true))});
`
      : ''
  );
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
  const recoveryCalls = readFileSync(calls, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  rmSync(dir, { recursive: true, force: true });
  return {
    status: done.status,
    runs,
    ...(recovery ? { calls: recoveryCalls } : {}),
  };
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

test('a genuine policy red stays red without looking up or rerunning Source Validation', () => {
  // Historical #23732: only PR Ready failed, but the measured-win verdict
  // was still red. Re-reading that unchanged verdict cannot repair the PR.
  assert.deepEqual(verdict([1], { FLEET_TOKEN: 'fixture-app' }, {}), {
    status: 1,
    runs: 1,
    calls: [],
  });
});

test('a passing verdict can recover a missing-evidence PR Ready failure at the same head', () => {
  const result = verdict([0], { FLEET_TOKEN: 'fixture-app' }, {});
  assert.equal(result.status, 0);
  assert.equal(result.runs, 1);
  assert.equal(result.calls.length, 3);
  assert.match(
    result.calls[0].endpoint,
    /head_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&event=pull_request/
  );
  assert.deepEqual(result.calls.slice(1), [
    {
      endpoint:
        'repos/JovieInc/Jovie/actions/runs/40966352433/jobs?filter=latest&per_page=100',
      post: false,
    },
    {
      endpoint:
        'repos/JovieInc/Jovie/actions/runs/40966352433/rerun-failed-jobs',
      post: true,
    },
  ]);
});

test('a passing verdict never retries another genuine Source Validation failure', () => {
  const result = verdict(
    [0],
    { FLEET_TOKEN: 'fixture-app' },
    { onlyReady: false }
  );
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 2);
  assert.ok(result.calls.every(call => !call.post));
});

test('quota deferral preserves its finite retry budget and makes no recovery calls', () => {
  assert.deepEqual(verdict([75], { FLEET_TOKEN: 'fixture-app' }, {}), {
    status: 75,
    runs: 4,
    calls: [],
  });
  const recovered = verdict([75, 75, 0], { FLEET_TOKEN: 'fixture-app' }, {});
  assert.equal(recovered.status, 0);
  assert.equal(recovered.runs, 3);
  assert.equal(recovered.calls.filter(call => call.post).length, 1);
});

test('no App token or an invalid head never spends recovery authority', () => {
  assert.deepEqual(verdict([0], { FLEET_TOKEN: '' }, {}), {
    status: 0,
    runs: 1,
    calls: [],
  });
  assert.deepEqual(
    verdict([0], { FLEET_TOKEN: 'fixture-app', HEAD_SHA: 'unbound' }, {}),
    {
      status: 1,
      runs: 0,
      calls: [],
    }
  );
});
