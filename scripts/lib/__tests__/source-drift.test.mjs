import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compareBuild,
  compareEmailDns,
  compareStripePrices,
  driftPlan,
  parseOwnerPrices,
  runDriftChecks,
} from '../source-drift.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('owner prices are read from plan-prices.ts', () => {
  const ids = parseOwnerPrices(
    'monthlyUsd: 12,\npro: {\n monthly: X,\n yearly: 375,\n},\nmax: {\n monthly: 149,\n yearly: 1430,\n}'
  );
  assert.deepEqual(
    ids.map(p => [p.id, p.usd]),
    [
      ['pro-monthly', 12],
      ['pro-yearly', 375],
      ['max-monthly', 149],
      ['max-yearly', 1430],
    ]
  );
});

test('stripe drift: missing, wrong amount and inactive prices are findings', () => {
  const owner = [{ id: 'pro-monthly', usd: 12, interval: 'month' }];
  const live = (amount, active = true) => [
    {
      active,
      currency: 'usd',
      unit_amount: amount,
      recurring: { interval: 'month' },
    },
  ];
  assert.equal(compareStripePrices(owner, live(1200)).length, 0);
  assert.equal(compareStripePrices(owner, live(1900)).length, 1);
  assert.equal(compareStripePrices(owner, live(1200, false)).length, 1);
});

test('email dns: spf and dmarc are required', () => {
  assert.equal(
    compareEmailDns(
      'jov.ie',
      ['v=spf1 include:x ~all'],
      ['v=DMARC1; p=none'],
      ['spf', 'dmarc']
    ).length,
    0
  );
  assert.equal(compareEmailDns('jov.ie', [], [], ['spf', 'dmarc']).length, 2);
});

test('production build: too many commits or too old is drift', () => {
  const base = {
    prodSha: 'abcdef1234',
    nowMs: Date.parse('2026-10-29T12:00:00Z'),
    maxBehindCommits: 60,
    maxAgeHours: 24,
  };
  assert.equal(
    compareBuild({
      ...base,
      behindBy: 5,
      oldestUnreleasedAt: '2026-10-29T10:00:00Z',
    }).length,
    0
  );
  assert.equal(
    compareBuild({
      ...base,
      behindBy: 118,
      oldestUnreleasedAt: '2026-10-29T10:00:00Z',
    }).length,
    1
  );
  assert.equal(
    compareBuild({
      ...base,
      behindBy: 3,
      oldestUnreleasedAt: '2026-10-27T10:00:00Z',
    }).length,
    1
  );
  assert.equal(
    compareBuild({ ...base, behindBy: 0, oldestUnreleasedAt: null }).length,
    0
  );
});

test('plans carry a stable fingerprint so one drift is one issue', () => {
  const f = { check: 'email-dns', key: 'jov.ie-spf', message: 'm' };
  assert.equal(driftPlan(f).fingerprint, driftPlan(f).fingerprint);
  assert.match(driftPlan(f).fingerprint, /^sot-drift-email-dns-/);
});

test('end to end with injected readers; no Stripe key skips with a warning', async () => {
  const fetchImpl = async url => {
    const u = String(url);
    if (u.includes('dns-query'))
      return {
        ok: true,
        json: async () => ({
          Answer: u.includes('_dmarc')
            ? []
            : [{ type: 16, data: '"v=spf1 -all"' }],
        }),
      };
    return { ok: true, json: async () => ({ commitSha: 'a'.repeat(40) }) };
  };
  const gh = async () =>
    JSON.stringify({ ahead: 118, oldest: '2026-10-28T00:00:00Z' });
  const report = await runDriftChecks({
    root,
    env: {},
    fetchImpl: /** @type {typeof fetch} */ (/** @type {unknown} */ (fetchImpl)),
    gh,
    now: () => Date.parse('2026-10-29T12:00:00Z'),
  });
  assert.ok(report.warnings.some(w => /STRIPE_READONLY_KEY/.test(w)));
  assert.deepEqual(report.findings.map(f => `${f.check}:${f.key}`).sort(), [
    'email-dns:jov.ie-dmarc',
    'production-build:age',
    'production-build:commits',
  ]);
  assert.ok(report.run.stages.every(s => s.ok));
});
