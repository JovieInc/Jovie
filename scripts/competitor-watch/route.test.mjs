import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideRoute,
  linearPayload,
  parseResearchSlugs,
  researchQuery,
  toObservation,
} from './route.mjs';

const base = {
  id: 'abc123',
  source: 'vercel',
  title: 'Virtual Models',
  url: 'https://vercel.com/blog/x?utm_source=a',
  first_seen_at: '2026-10-29T10:00:00.000Z',
  published_at: null,
  summary: 's',
  why: 'w',
  surfaces: '["chat"]',
  route_status: 'new',
};

test('cost items go to the cost loop at relevance 3', () => {
  assert.equal(
    decideRoute({ ...base, relevance: 3, cost_saving: 1 }).destination,
    'cost-loop'
  );
});
test('adoptable relevant items open the adopt pipeline', () => {
  assert.equal(
    decideRoute({ ...base, relevance: 4, adoptable_now: 1 }).destination,
    'adopt'
  );
});
test('security items are evidence only, never adopted', () => {
  const d = decideRoute({
    ...base,
    relevance: 4,
    adoptable_now: 1,
    kind: 'security',
  });
  assert.equal(d.destination, 'idea-radar');
});
test('weak or already-routed items are dropped', () => {
  assert.equal(decideRoute({ ...base, relevance: 3 }).destination, 'none');
  assert.equal(decideRoute({ ...base, relevance: 4 }).destination, 'none');
  assert.equal(
    decideRoute({
      ...base,
      relevance: 5,
      adoptable_now: 1,
      route_status: 'routed',
    }).destination,
    'none'
  );
});
test('observation is canonical evidence with a stable identity', () => {
  const ev = toObservation({ ...base, relevance: 5 });
  assert.equal(ev.schema, 'jovie.canonical-evidence/v1');
  assert.equal(ev.provenance.sourceUrl, 'https://vercel.com/blog/x');
  assert.equal(ev.id, toObservation({ ...base, relevance: 5 }).id);
});
test('linear payload carries the compounding label and a Done section', () => {
  const p = linearPayload({ ...base, relevance: 4 }, { destination: 'adopt' });
  assert.ok(p.labels.includes('compounding'));
  assert.match(p.description, /## Done/);
});

test('research slugs come from gbrain search output above the score floor', () => {
  const out =
    '[1.2] concepts/x -- X\n[1.0] research/q-1 -- R1\n[0.3] research/q-2 -- R2\n[0.95] decisions/research/d -- D';
  assert.deepEqual(parseResearchSlugs(out), [
    'research/q-1',
    'decisions/research/d',
  ]);
});

test('research query keeps three distinctive words', () => {
  assert.equal(
    researchQuery('Introducing Virtual Models on AI Gateway'),
    'virtual models gateway'
  );
  assert.equal(
    researchQuery('Mistral lower pricing on Gateway', 'pricing'),
    'mistral gateway pricing'
  );
});
