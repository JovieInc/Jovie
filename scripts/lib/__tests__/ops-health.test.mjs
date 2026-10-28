import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildOpsHealth,
  dependencyFromReceipt,
  normalizeSha,
  rollupStatus,
  toIso,
  validateOpsHealth,
} from '../ops-health.mjs';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const SHA = 'a'.repeat(40);
const base = {
  service: 'jovie-web',
  environment: 'production',
  commitSha: SHA,
  deployedAt: '2026-10-28T11:00:00.000Z',
  version: '26.10.16',
  now: NOW,
};

test('a fully known healthy service validates', () => {
  const body = buildOpsHealth({
    ...base,
    dependencies: [
      { name: 'db', status: 'up', observedAt: NOW - 1000, latencyMs: 12 },
    ],
  });
  assert.equal(body.status, 'up');
  assert.deepEqual(validateOpsHealth(body, { now: NOW }), {
    ok: true,
    errors: [],
  });
});

test('unknown stays explicit: no dependencies rolls up unknown, short sha is null', () => {
  const body = buildOpsHealth({ ...base, commitSha: 'abc1234' });
  assert.equal(body.status, 'unknown');
  assert.equal(body.commitSha, null);
  assert.equal(validateOpsHealth(body, { now: NOW }).ok, true);
});

test('up cannot hide an unknown dependency or a null commit', () => {
  const body = buildOpsHealth({
    ...base,
    commitSha: null,
    status: 'up',
    dependencies: [{ name: 'gbrain', status: 'unknown', observedAt: null }],
  });
  const { errors } = validateOpsHealth(body, { now: NOW });
  assert.ok(errors.some(e => e.includes('hides dependency gbrain')));
  assert.ok(errors.some(e => e.includes('unknown commitSha')));
});

test('a stale receipt is unknown, and an up dependency from a stale observation is invalid', () => {
  const stale = dependencyFromReceipt(
    'githubRead',
    { verified: true, observedAt: NOW - 3_600_000 },
    { now: NOW }
  );
  assert.equal(stale.status, 'unknown');
  assert.equal(stale.detail, 'stale');
  const fresh = dependencyFromReceipt(
    'githubRead',
    { verified: true, observedAt: NOW - 1000 },
    { now: NOW }
  );
  assert.equal(fresh.status, 'up');
  const forged = buildOpsHealth({
    ...base,
    dependencies: [{ name: 'x', status: 'up', observedAt: NOW - 3_600_000 }],
  });
  assert.ok(
    validateOpsHealth(forged, { now: NOW }).errors.some(e =>
      e.includes('stale observation')
    )
  );
});

test('toIso rejects fake instants and normalises epoch ms', () => {
  assert.equal(toIso(0), null);
  assert.equal(toIso(''), null);
  assert.equal(toIso('nope'), null);
  assert.equal(toIso(NOW), '2026-10-28T12:00:00.000Z');
  assert.equal(normalizeSha(SHA.toUpperCase()), SHA);
});

test('rollup is worst-of', () => {
  assert.equal(
    rollupStatus([{ status: 'up' }, { status: 'degraded' }]),
    'degraded'
  );
  assert.equal(
    rollupStatus([{ status: 'up' }, { status: 'unknown' }, { status: 'down' }]),
    'down'
  );
});

test('legacy numeric deployedAt is rejected by the validator', () => {
  const body = { ...buildOpsHealth(base), deployedAt: 1793230717303 };
  assert.equal(validateOpsHealth(body, { now: NOW }).ok, false);
});
