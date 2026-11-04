import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { emptyState, pickBatch } from '../mutation-sweep.mjs';
import { classifyProductLanes } from '../product-lane-classifier.mjs';
import {
  parseChurn,
  rankSurfaces,
  SURFACES_CONFIG_PATH,
  touchScore,
} from '../test-quality-rank.mjs';

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

test('surfaces config stays on a path the trusted base classifier already maps', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const config = JSON.parse(
    readFileSync(resolve(repoRoot, SURFACES_CONFIG_PATH), 'utf8')
  );
  expect(config.tiers.length).toBeGreaterThan(0);
  expect(
    readFileSync(resolve(repoRoot, 'scripts/test-quality-loop.mjs'), 'utf8')
  ).not.toContain('config/test-quality/surfaces.json');
  const receipt = classifyProductLanes([SURFACES_CONFIG_PATH]);
  expect(receipt.classifications).toEqual([
    {
      path: SURFACES_CONFIG_PATH,
      category: 'operations-tooling',
      affectedProducts: [],
      rule: 'operations-tooling',
    },
  ]);
  expect(receipt.selectedLanes).toEqual(['operations']);
  expect(() =>
    classifyProductLanes(['config/test-quality/surfaces.json'])
  ).toThrow(
    'Unmapped changed paths: config/test-quality/surfaces.json. Add an explicit product-lane rule before intake can continue.'
  );
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
