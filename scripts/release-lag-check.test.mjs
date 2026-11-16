import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateReleaseLag,
  findBlocker,
  readBuildInfo,
} from './release-lag-check.mjs';

const H = 3_600_000;
const base = {
  prodSha: 'a'.repeat(40),
  mainSha: 'b'.repeat(40),
  nowMs: 10 * H,
};

test('lagging when the oldest unshipped main commit is older than the limit', () => {
  const r = evaluateReleaseLag({ ...base, firstUnshippedMs: 1 * H });
  assert.equal(r.ok, false);
  assert.match(r.reason, /9\.0h/);
});
test('ok when production has main, nothing is unshipped, or the unshipped commit is recent', () => {
  assert.equal(
    evaluateReleaseLag({ ...base, mainSha: base.prodSha, firstUnshippedMs: 0 })
      .ok,
    true
  );
  assert.equal(evaluateReleaseLag({ ...base }).ok, true);
  assert.equal(
    evaluateReleaseLag({ ...base, firstUnshippedMs: 9 * H }).ok,
    true
  );
});
test('unreadable build-info alerts', () => {
  assert.equal(evaluateReleaseLag({ ...base, prodSha: '' }).ok, false);
});
test('names the failing job and step of the newest failed run', () => {
  const runs = [
    { databaseId: 2, conclusion: 'success', url: 'u2' },
    { databaseId: 1, conclusion: 'failure', url: 'u1' },
  ];
  const jobs = () => [
    { name: 'ok', conclusion: 'success' },
    {
      name: 'Promote to Production',
      conclusion: 'failure',
      steps: [{ name: 'Prove LCP budgets', conclusion: 'failure' }],
    },
  ];
  assert.equal(
    findBlocker(runs, jobs),
    'Promote to Production / Prove LCP budgets (u1)'
  );
  assert.match(
    findBlocker([{ databaseId: 3, conclusion: 'success' }], jobs),
    /superseded/
  );
});

test('readBuildInfo retries transient network errors and returns the receipt', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) throw new Error('fetch failed: read ECONNRESET');
    return { ok: true, json: async () => ({ commitSha: 'c'.repeat(40) }) };
  };
  const info = await readBuildInfo('https://jov.ie/api/health/build-info', fetchImpl, [0, 0]);
  assert.equal(calls, 3);
  assert.deepEqual(info, { commitSha: 'c'.repeat(40) });
});
test('readBuildInfo retries 5xx and 429 but treats a 4xx as the answer', async () => {
  let status = 503;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status, json: async () => ({}) };
  };
  await assert.rejects(readBuildInfo('u', fetchImpl, [0, 0]), /HTTP 503/);
  assert.equal(calls, 3);
  calls = 0;
  status = 404;
  await assert.rejects(readBuildInfo('u', fetchImpl, [0, 0]), /HTTP 404/);
  assert.equal(calls, 1);
});
test('readBuildInfo rethrows after the last retry so the dead-man stays red', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error('read ECONNRESET');
  };
  await assert.rejects(readBuildInfo('u', fetchImpl, [0, 0]), /ECONNRESET/);
  assert.equal(calls, 3);
});
