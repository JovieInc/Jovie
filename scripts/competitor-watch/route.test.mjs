import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { promisify } from 'node:util';

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

test('CLI emits complete evidence and Linear payloads before marking selected items', async t => {
  const items = [
    { ...base, id: 'a1', relevance: 5 },
    { ...base, id: 'b2', relevance: 4, adoptable_now: 1 },
    { ...base, id: 'c3', relevance: 3, cost_saving: 1 },
    { ...base, id: 'd4', relevance: 1 },
  ];
  const requests = [];
  const server = createServer((req, res) => {
    requests.push([req.method, req.url, req.headers.authorization]);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.method === 'GET' ? { items } : { ok: true }));
  });
  t.after(() => server.close());
  await new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  );
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [new URL('./route.mjs', import.meta.url).pathname, '--mark'],
    {
      env: {
        ...process.env,
        COMPETITOR_WATCH_URL: `http://127.0.0.1:${address.port}`,
        COMPETITOR_WATCH_TOKEN: 'test-watch',
      },
      timeout: 10000,
    }
  );
  const entries = JSON.parse(stdout);
  assert.deepEqual(
    entries.map(e => [e.id, e.destination]),
    [
      ['a1', 'idea-radar'],
      ['b2', 'adopt'],
      ['c3', 'cost-loop'],
    ]
  );
  assert.equal(entries[0].evidence.schema, 'jovie.canonical-evidence/v1');
  assert.equal(entries[0].linear, undefined);
  for (const entry of entries.slice(1)) {
    assert.equal(entry.linear.title, '[watch] Virtual Models');
    assert.equal(entry.evidence, undefined);
  }
  assert.deepEqual(
    requests.slice(1).map(r => r.slice(0, 2)),
    [
      ['POST', '/items/a1/routed'],
      ['POST', '/items/b2/routed'],
      ['POST', '/items/c3/routed'],
    ]
  );
  assert.ok(requests.every(r => r[2] === 'Bearer test-watch'));
});
