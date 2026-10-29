import { expect, test } from 'vitest';
import { emptyState, pickBatch } from '../mutation-sweep.mjs';
import { parseChurn, rankSurfaces, touchScore } from '../test-quality-rank.mjs';

const config = {
  churnWeight: 2,
  churnCap: 10,
  tiers: [
    { name: 'billing', weight: 100, prefixes: ['lib/billing/'] },
    { name: 'default', weight: 10, prefixes: [''] },
  ],
};

test('tier weight dominates a churny low-tier file; churn is capped', () => {
  expect(touchScore('lib/billing/a.ts', 0, config)).toBe(100);
  expect(touchScore('lib/x.ts', 500, config)).toBe(30);
});

test('rankSurfaces orders high-touch first', () => {
  const r = rankSurfaces(
    ['lib/x.ts', 'lib/billing/a.ts'],
    { 'lib/x.ts': 9 },
    config
  );
  expect(r.map(x => x.file)).toEqual(['lib/billing/a.ts', 'lib/x.ts']);
});

test('parseChurn counts only apps/web paths', () => {
  expect(
    parseChurn('apps/web/lib/a.ts\n\napps/web/lib/a.ts\nother/b.ts')
  ).toEqual({ 'lib/a.ts': 2 });
});

test('pickBatch breaks rank ties by touch before age', () => {
  const state = emptyState();
  const picked = pickBatch(
    state,
    [
      { file: 'lib/low.ts', blob: 'a', testCount: 1, touch: 5 },
      { file: 'lib/high.ts', blob: 'b', testCount: 0, touch: 120 },
    ],
    { max: 2 }
  );
  expect(picked).toEqual(['lib/high.ts', 'lib/low.ts']);
});

import {
  aggregateByTier,
  evaluateFloors,
  modelFingerprint,
  rearmTop,
  survivorsKilled,
} from '../test-quality-metrics.mjs';

const surfaces = { tiers: config.tiers };
const state = {
  modules: {
    'lib/billing/a.ts': {
      status: 'scored',
      valid: 100,
      killed: 60,
      survived: 40,
      durationMs: 60000,
    },
    'lib/x.ts': {
      status: 'scored',
      valid: 10,
      killed: 10,
      survived: 0,
      durationMs: 0,
    },
    'lib/y.ts': { status: 'error', valid: 0, survived: 0 },
  },
};

test('aggregateByTier weights by valid mutants and skips unscored', () => {
  const t = aggregateByTier(state, surfaces);
  expect(t.billing.score).toBe(60);
  expect(t.billing.minutes).toBe(1);
  expect(t.default.modules).toBe(1);
});

test('floors only ratchet up and violations are reported', () => {
  const t = aggregateByTier(state, surfaces);
  expect(evaluateFloors(t, { billing: 70 }).violations).toEqual([
    { tier: 'billing', score: 60, floor: 70 },
  ]);
  expect(evaluateFloors(t, { billing: 10 }).next.billing).toBe(59);
  expect(evaluateFloors(t, { billing: 90 }).next.billing).toBe(90);
});

test('survivors killed counts only decreases', () => {
  expect(
    survivorsKilled({ 'lib/billing/a.ts': 50, 'lib/x.ts': 0 }, state)
  ).toBe(10);
});

test('model fingerprint is order independent and rearm marks top scored modules', () => {
  expect(modelFingerprint({ a: '1', b: '2' })).toBe(
    modelFingerprint({ b: '2', a: '1' })
  );
  const s = structuredClone(state);
  expect(
    rearmTop(
      s,
      [
        { file: 'lib/billing/a.ts' },
        { file: 'lib/y.ts' },
        { file: 'lib/x.ts' },
      ],
      2
    )
  ).toBe(2);
  expect(s.modules['lib/billing/a.ts'].at).toBe(new Date(0).toISOString());
});
