import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { productReady } from './ready-gate.mjs';
import {
  inShard,
  mergeReceipts,
  parseShard,
  shardOf,
  summaryLines,
} from './shard.mjs';

const routes = [
  ...new Set(
    JSON.parse(
      readFileSync(
        'docs/product/generated/artist-launch-inventory.json',
        'utf8'
      )
    )
      .inventory.filter(i => i.kind === 'page')
      .map(i => i.route)
  ),
];

test('parseShard reads i/n and defaults to the whole crawl', () => {
  assert.deepEqual(parseShard(''), { index: 1, count: 1 });
  assert.deepEqual(parseShard('3/4'), { index: 3, count: 4 });
  for (const bad of ['0/4', '5/4', '2', 'a/b', '1/0'])
    assert.throws(() => parseShard(bad), /--shard must look like/);
});

test('every route lands in exactly one shard, and the shards are balanced', () => {
  const count = 4;
  const sizes = [0, 0, 0, 0];
  for (const route of routes) {
    const owners = [1, 2, 3, 4].filter(index =>
      inShard(route, { index, count })
    );
    assert.equal(owners.length, 1, route);
    assert.equal(shardOf(route, count), owners[0]); // stable
    sizes[owners[0] - 1] += 1;
  }
  const even = routes.length / count;
  for (const n of sizes)
    assert.ok(n > even * 0.6 && n < even * 1.4, `${sizes}`);
});

const page = (route, identity, extra = {}) => ({
  route,
  url: route,
  identity,
  viewport: 'desktop',
  status: 200,
  cls: 0,
  lcpMs: 500,
  longestTaskMs: 10,
  loadMs: 400,
  consoleErrors: [],
  failedRequests: [],
  ...extra,
});

/**
 * A whole crawl, then the same crawl as the shards would have written it.
 * @param {number} count @returns {{ whole: any, shards: any[] }}
 */
function fixture(count) {
  const rs = ['/', '/about', '/pricing', '/signin', '/[username]', '/app'];
  const at = '2026-11-14T20:00:00Z';
  const base = {
    schema: 'product-crawl/v1',
    origin: 'https://fixture.invalid',
    sha: 'abc',
    at,
    signedIn: true,
    samples: {},
    sitemapProblem: null,
    closedInProduction: [],
  };
  const pages = rs.flatMap(r => [
    page(r, 'stranger', r === '/pricing' ? { cls: 0.9 } : {}),
    page(r, 'signed-in'),
  ]);
  const uncovered = [{ route: '/app', reason: 'needs a fixture' }];
  const whole = {
    ...base,
    routes: rs,
    uncovered,
    outOfTime: null,
    overlayWalks: { walks: [], left: 0 },
    pages,
  };
  const shards = Array.from({ length: count }, (_, i) => {
    const shard = { index: i + 1, count };
    const mine = r => inShard(r, shard);
    return {
      ...base,
      shard,
      routes: rs.filter(mine),
      uncovered: uncovered.filter(u => mine(u.route)),
      outOfTime: null,
      overlayWalks: { walks: [], left: 0 },
      pages: pages.filter(p => mine(p.route)),
    };
  });
  return { whole, shards };
}

test('merged shards are judged exactly like the whole crawl', () => {
  const now = Date.parse('2026-11-14T21:00:00Z');
  const { whole, shards } = fixture(4);
  const merged = mergeReceipts(shards.reverse());
  assert.deepEqual([...merged.routes].sort(), [...whole.routes].sort());
  assert.equal(merged.pages.length, whole.pages.length);
  const a = productReady(whole, { now });
  const b = productReady(merged, { now });
  assert.deepEqual(b.reasons, a.reasons);
  assert.equal(b.findings.length, a.findings.length);
  assert.ok(a.findings.length > 0, 'fixture has a finding to carry over');
  assert.match(summaryLines(merged, b)[2], /Crawled in 4 parallel shards/);
});

test('a missing shard, a duplicate shard or another build never merges', () => {
  const { shards } = fixture(4);
  assert.throws(() => mergeReceipts(shards.slice(1)), /not one whole crawl/);
  assert.throws(
    () => mergeReceipts([...shards.slice(1), shards[1]]),
    /not one whole crawl/
  );
  assert.throws(
    () => mergeReceipts([{ ...shards[0], sha: 'other' }, ...shards.slice(1)]),
    /disagree on sha/
  );
  assert.throws(() => mergeReceipts([]), /no shard receipts/);
});

test('deadline and walk gaps add up across shards', () => {
  const { shards } = fixture(2);
  shards[0].outOfTime = { loadsLeft: 3, resamplesLeft: 0 };
  shards[1].outOfTime = { loadsLeft: 2, resamplesLeft: 1 };
  shards[1].overlayWalks = { walks: [{ route: '/' }], left: 4 };
  const merged = mergeReceipts(shards);
  assert.deepEqual(merged.outOfTime, { loadsLeft: 5, resamplesLeft: 1 });
  assert.deepEqual(merged.overlayWalks, { walks: [{ route: '/' }], left: 4 });
});

test('a shard that lost its sign-in fails the merged gate', () => {
  const now = Date.parse('2026-11-14T21:00:00Z');
  const { shards } = fixture(4);
  const lost = shards[2];
  lost.signedIn = false;
  lost.pages = lost.pages.filter(p => p.identity === 'stranger');
  const merged = mergeReceipts(shards);
  assert.equal(merged.signedIn, false);
  assert.deepEqual(merged.strangerOnlyShards, [3]);
  const { ready, reasons } = productReady(merged, { now });
  assert.equal(ready, false);
  assert.ok(
    reasons.includes('shard 3 crawled only as a stranger'),
    `${reasons}`
  );
});
