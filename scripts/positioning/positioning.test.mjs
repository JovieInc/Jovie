import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gateVariant } from './gates.mjs';
import {
  aggregate,
  parseScores,
  schemaFor,
  shuffled,
  WIN_MARGIN,
} from './rank.mjs';

const registry = JSON.parse(
  readFileSync(
    new URL('../../canon/positioning-variants.json', import.meta.url),
    'utf8'
  )
);
const base = registry.variants.find(
  v => v.id === registry.surfaces['application.one_liner'].active
);

test('every surface active id names a variant, and the active variant passes all gates', () => {
  const ids = new Set(registry.variants.map(v => v.id));
  for (const [surface, s] of Object.entries(registry.surfaces))
    if (s.active) assert.ok(ids.has(s.active), `${surface} -> ${s.active}`);
  const result = gateVariant(base, registry);
  assert.deepEqual(result.failures, []);
});

test('vision without a today anchor fails the truth gate', () => {
  const v = structuredClone(base);
  v.id = 'bad-vision';
  v.vision = 'creators turning content into careers';
  v.lines.what_building =
    'The operating system for creators turning content into careers.';
  const r = gateVariant(v, registry);
  assert.equal(r.pass, false);
  assert.ok(r.failures.some(f => f.startsWith('truth:')));
});

test('prices, traction numbers, canon-banned lines and over-length one-liners fail', () => {
  const v = structuredClone(base);
  v.lines.one_liner =
    'Your AI manager for 10,000 artists at $12 a month, guaranteed';
  const r = gateVariant(v, registry);
  const text = r.failures.join('\n');
  assert.match(text, /canon-banned/);
  assert.match(text, /claim-like number/);
  assert.match(text, /price wording/);
  assert.match(text, /chars > 50/);
});

test('an ICP outside allowedIcps is a pivot signal, never a candidate', () => {
  const v = { ...structuredClone(base), icp: 'restaurants' };
  const r = gateVariant(v, registry);
  assert.equal(r.pivotSignal, true);
  assert.equal(r.pass, false);
});

test('shuffle is deterministic and a permutation', () => {
  const items = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffled(items, 7), shuffled(items, 7));
  assert.deepEqual([...shuffled(items, 7)].sort(), items);
});

test('parseScores maps letters back to variant ids and rejects missing options', () => {
  const order = [{ id: 'a' }, { id: 'b' }];
  const text = JSON.stringify({
    scores: [
      { option: 'B', score: 4, yes: false, red_flags: [], reason: 'x' },
      { option: 'A', score: 9, yes: true, red_flags: [], reason: 'y' },
    ],
  });
  assert.deepEqual(
    parseScores(text, order).map(s => [s.id, s.score]),
    [
      ['a', 9],
      ['b', 4],
    ]
  );
  assert.throws(
    () =>
      parseScores(
        JSON.stringify({ scores: [{ option: 'A', score: 1 }] }),
        order
      ),
    /missing option B/
  );
  assert.equal(schemaFor(2).properties.scores.minItems, 2);
});

const vote = (kind, a, b) => ({
  kind,
  scores: [
    { id: 'a', score: a, yes: a > 5 },
    { id: 'b', score: b, yes: b > 5 },
  ],
});

test('a winner needs to lead BOTH panels by the margin', () => {
  const clear = aggregate(
    [vote('investor', 8, 6), vote('buyer', 7, 5)],
    ['a', 'b']
  );
  assert.equal(clear.winner, 'a');
  const split = aggregate(
    [vote('investor', 8, 6), vote('buyer', 5, 7)],
    ['a', 'b']
  );
  assert.equal(split.winner, null);
  const close = aggregate(
    [vote('investor', 8, 8 - WIN_MARGIN / 2), vote('buyer', 7, 5)],
    ['a', 'b']
  );
  assert.equal(close.winner, null);
});
