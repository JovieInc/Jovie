import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { buildOpsHealth } from '../ops-health.mjs';
import {
  checkEndpoint,
  loadEndpointRegistry,
  runConformance,
} from '../ops-health-conformance.mjs';
import { planOpsHealth } from '../remediation-sweep.mjs';

const SHA = 'd'.repeat(40);
const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const good = () =>
  buildOpsHealth({
    service: 's',
    environment: 'production',
    commitSha: SHA,
    deployedAt: NOW - 1000,
    version: '1',
    status: 'up',
    now: NOW,
  });
const respond = body => async () => ({ status: 200, json: async () => body });
const endpoint = (conformance = 'enforced') => ({
  id: 's:production',
  url: 'https://x.test',
  conformance,
  expectedSha: 'r',
});
const heads = { r: { repo: 'o/r', ref: 'main' } };

test('registry owners resolve in canon/ownership.json and conformance values are valid', () => {
  const registry = loadEndpointRegistry();
  const ids = new Set(
    JSON.parse(
      readFileSync(
        new URL('../../../canon/ownership.json', import.meta.url),
        'utf8'
      )
    ).assets.map(a => a.id)
  );
  for (const e of registry.endpoints) {
    assert.ok(
      ids.has(e.ownerRef),
      `${e.id} ownerRef ${e.ownerRef} missing from canon/ownership.json`
    );
    assert.ok(['enforced', 'pending'].includes(e.conformance));
    if (e.conformance === 'pending')
      assert.ok(e.trackedBy, `${e.id} pending without trackedBy`);
    if (e.expectedSha)
      assert.ok(
        registry.expectedSha[e.expectedSha],
        `${e.id} unknown expectedSha key`
      );
  }
});

test('a conforming endpoint on the branch head passes and reports lag', async () => {
  const compare = async () => ({ status: 'ahead', ahead_by: 3 });
  const r = await checkEndpoint(endpoint(), {
    fetchImpl: respond(good()),
    now: NOW,
    compare,
    heads,
  });
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(r.lag, { state: 'behind', behindBy: 3 });
});

test('drift, a diverged commit and a wrong expected sha all fail', async () => {
  const legacy = await checkEndpoint(endpoint(), {
    fetchImpl: respond({ buildId: 'x', commitSha: SHA }),
    now: NOW,
    heads,
  });
  assert.equal(legacy.verdict, 'fail');
  const diverged = await checkEndpoint(endpoint(), {
    fetchImpl: respond(good()),
    now: NOW,
    heads,
    compare: async () => ({ status: 'diverged' }),
  });
  assert.match(diverged.errors.join(), /not an ancestor/);
  const wrong = await checkEndpoint(endpoint(), {
    fetchImpl: respond(good()),
    now: NOW,
    expectSha: 'e'.repeat(40),
  });
  assert.match(wrong.errors.join(), /is not expected/);
});

test('unreachable and non-200 are failures, never healthy', async () => {
  const down = await checkEndpoint(endpoint(), {
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
    now: NOW,
  });
  assert.equal(down.verdict, 'fail');
  const gone = await checkEndpoint(endpoint(), {
    fetchImpl: async () => ({ status: 404, json: async () => ({}) }),
    now: NOW,
  });
  assert.equal(gone.verdict, 'fail');
});

test('pending passes while non-conforming and fails once it conforms (ratchet)', async () => {
  const stillLegacy = await checkEndpoint(endpoint('pending'), {
    fetchImpl: respond({}),
    now: NOW,
  });
  assert.equal(stillLegacy.verdict, 'pending');
  const flipped = await checkEndpoint(endpoint('pending'), {
    fetchImpl: respond(good()),
    now: NOW,
  });
  assert.equal(flipped.verdict, 'pending-conforms');
  const report = await runConformance({
    registry: { expectedSha: {}, endpoints: [endpoint('pending')] },
    fetchImpl: respond(good()),
    now: NOW,
  });
  assert.equal(report.ok, false);
});

test('sweep plans one fingerprinted issue per failing endpoint only', () => {
  const plans = planOpsHealth({
    results: [
      {
        id: 'a:production',
        url: 'u',
        verdict: 'fail',
        errors: ['HTTP 500'],
        commitSha: null,
      },
      { id: 'b:production', url: 'u', verdict: 'ok', errors: [] },
      { id: 'c:production', url: 'u', verdict: 'pending', errors: ['x'] },
      { id: 'd:production', url: 'u', verdict: 'pending-conforms', errors: [] },
    ],
  });
  assert.deepEqual(
    plans.map(p => p.fingerprint),
    [
      'remediation:ops-health:a:production',
      'remediation:ops-health:d:production',
    ]
  );
});

test('the daily Remediation Sweep runs the ops-health mode', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/remediation-sweep.yml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(workflow, /run_mode ops-health/);
});

test('a nested envelope is read from envelopePath and a missing one is a failure', async () => {
  const nested = { ...endpoint(), envelopePath: 'ops' };
  const ok = await checkEndpoint(nested, {
    fetchImpl: respond({ schema: 'other/v1', ops: good() }),
    now: NOW,
  });
  assert.equal(ok.verdict, 'ok');
  const missing = await checkEndpoint(nested, {
    fetchImpl: respond({ schema: 'other/v1' }),
    now: NOW,
  });
  assert.equal(missing.verdict, 'fail');
  assert.match(missing.errors.join(), /no ops.health\/v1 envelope at ops/);
});
