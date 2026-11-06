import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  acquireLease,
  decideRound,
  foreignUnsaved,
  percentiles,
  readLease,
  releaseLease,
  withWriterLease,
} from './loop-state.mjs';

const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('loop decision: two quiet rounds pass, findings fix, max rounds fail', () => {
  const quiet = {
    checks: [],
    gates: { failed: [] },
    judges: [{ material: true, confirmed: false }],
  };
  const first = decideRound({ ...quiet, quietRounds: 0 });
  assert.equal(first.action, 'rejudge');
  assert.equal(
    decideRound({ ...quiet, quietRounds: first.quietRounds }).action,
    'pass'
  );
  const block = {
    checks: [
      { check: 'grid', severity: 'block', message: 'x', node: 'n' },
      { check: 'contrast', severity: 'block', message: 'c', node: 'm' },
    ],
  };
  const fix = decideRound({ ...block, round: 0 });
  assert.equal(fix.action, 'fix');
  assert.equal(fix.topIssue.check, 'contrast');
  assert.equal(
    decideRound({ ...block, round: 7, maxRounds: 8 }).action,
    'fail'
  );
  const judged = decideRound({
    judges: [
      {
        material: true,
        confirmed: true,
        issue: 'CTA unclear',
        persona: 'buyer',
        key: 'cta',
      },
    ],
  });
  assert.equal(judged.topIssue.source, 'judge');
});

test('writer lease: exclusive, renewable, expiring, releasable', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'lease-')), 'w.json');
  let t = 1_000_000;
  const now = () => t;
  assert.ok(acquireLease(path, { holder: 'a', ttlMs: 1000, now }).ok);
  const held = acquireLease(path, { holder: 'b', ttlMs: 1000, now });
  assert.equal(held.ok, false);
  assert.equal(held.heldBy.holder, 'a');
  assert.ok(acquireLease(path, { holder: 'a', ttlMs: 1000, now }).renewed);
  t += 5000;
  assert.ok(acquireLease(path, { holder: 'b', ttlMs: 1000, now }).ok);
  assert.equal(releaseLease(path, 'a'), false);
  assert.ok(releaseLease(path, 'b'));
  assert.equal(readLease(path), null);
});

test('save guard flags unsaved nodes this writer did not touch', () => {
  const disk = { A: '1', B: '1' };
  const live = { A: '2', B: '1', T1E2z: '1' };
  assert.deepEqual(foreignUnsaved(live, disk, new Set(['A'])), ['T1E2z']);
  assert.deepEqual(foreignUnsaved(live, disk, new Set(['A', 'T1E2z'])), []);
});

test('percentiles for stage timing', () => {
  assert.deepEqual(percentiles([5, 1, 3, 2, 4]), { n: 5, p50: 3, p95: 5 });
  assert.deepEqual(percentiles([]), { n: 0, p50: null, p95: null });
});

test('incomplete judge evidence permits deterministic fixes but never counts as quiet', () => {
  const incomplete = {
    complete: false,
    quietRounds: 1,
    round: 0,
    maxRounds: 3,
  };
  assert.equal(decideRound(incomplete).action, 'rejudge');
  assert.equal(decideRound(incomplete).quietRounds, 0);
  const checks = [
    { severity: 'block', check: 'grid', node: 'n', message: 'off grid' },
  ];
  assert.equal(decideRound({ ...incomplete, checks }).action, 'fix');
  assert.equal(decideRound({ ...incomplete, checks, round: 2 }).action, 'fail');
  assert.equal(decideRound({ ...incomplete, round: 2 }).action, 'fail');
});

test('lease fails closed for partial content, foreign PID, lock contention and expired renewal', t => {
  const path = join(scratch(t), 'lease.json');
  writeFileSync(path, '');
  assert.equal(acquireLease(path, { holder: 'same' }).ok, false);
  assert.equal(releaseLease(path, 'same'), false);
  writeFileSync(
    path,
    JSON.stringify({
      holder: 'same',
      pid: process.pid + 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
  );
  assert.equal(acquireLease(path, { holder: 'same' }).ok, false);
  rmSync(path);
  assert.ok(acquireLease(path, { holder: 'a', now: () => 100, ttlMs: 100 }).ok);
  assert.equal(
    acquireLease(path, { holder: 'a', now: () => 201, renewOnly: true }).ok,
    false
  );
  mkdirSync(`${path}.lock`);
  assert.equal(acquireLease(path, { holder: 'b' }).ok, false);
  assert.equal(releaseLease(path, 'a'), false);
});

test('writer lease renews and releases on success, exceptions and lost ownership', async t => {
  const path = join(scratch(t), 'lease.json');
  let time = 100;
  const options = { holder: 'a', ttlMs: 100, now: () => time };
  assert.equal(
    await withWriterLease(path, options, renew => {
      time = 150;
      renew();
      assert.equal(Date.parse(readLease(path).expiresAt), 250);
      return 'done';
    }),
    'done'
  );
  assert.equal(readLease(path), null);
  await assert.rejects(
    withWriterLease(path, options, () => {
      throw new Error('frame failed');
    }),
    /frame failed/
  );
  assert.equal(readLease(path), null);
  await assert.rejects(
    withWriterLease(path, options, renew => {
      time = 300;
      assert.ok(acquireLease(path, { holder: 'b', now: () => time }).ok);
      renew();
    }),
    /writer lease lost/
  );
  assert.equal(readLease(path).holder, 'b');
});

test('competing processes cannot share a holder or race an expired takeover', async t => {
  const path = join(scratch(t), 'lease.json');
  writeFileSync(
    path,
    JSON.stringify({ holder: 'old', expiresAt: '2000-01-01T00:00:00Z' })
  );
  const module = new URL('./loop-state.mjs', import.meta.url).href;
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [
            '--input-type=module',
            '-e',
            `import {acquireLease} from ${JSON.stringify(module)}; console.log(JSON.stringify(acquireLease(${JSON.stringify(path)}, {holder:'same'})));`,
          ]);
          let stdout = '';
          child.stdout.on('data', b => {
            stdout += b;
          });
          child.on('error', reject);
          child.on('exit', code =>
            code === 0
              ? resolve(JSON.parse(stdout))
              : reject(new Error(`exit ${code}`))
          );
        })
    )
  );
  assert.equal(results.filter(r => r.ok).length, 1);
});
