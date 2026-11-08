import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageFindings, productReady, rankFindings } from './ready-gate.mjs';

const now = Date.parse('2026-11-08T03:00:00Z');
const clean = (route, identity) => ({
  route,
  identity,
  viewport: 'desktop',
  status: 200,
  cls: 0.01,
  lcpMs: 900,
  longestTaskMs: 50,
  loadMs: 1200,
  consoleErrors: [],
  failedRequests: [],
});
const receipt = pages => ({
  origin: 'https://jov.ie',
  sha: 'abc',
  at: '2026-11-08T02:00:00Z',
  routes: ['/', '/app'],
  pages,
});

test('a clean crawl of every route, as a stranger and signed in, is ready', () => {
  const r = productReady(
    receipt([
      clean('/', 'stranger'),
      clean('/app', 'signed-in'),
      {
        route: '/app',
        identity: 'stranger',
        viewport: 'desktop',
        authGated: true,
      },
    ]),
    { now, deployedSha: 'abc' }
  );
  assert.deepEqual(r, { ready: true, reasons: [], findings: [] });
});

test('jank, a stale or wrong build, or a gap in coverage is not ready', () => {
  const janky = {
    ...clean('/', 'stranger'),
    cls: 0.31,
    longestTaskMs: 640,
    consoleErrors: ['TypeError: x'],
  };
  const kinds = pageFindings(janky).map(f => f.kind);
  assert.deepEqual(kinds, ['layout-shift', 'frozen-frame', 'console-error']);
  assert.equal(
    productReady(receipt([janky, clean('/app', 'signed-in')]), { now }).ready,
    false
  );
  const stale = {
    ...receipt([clean('/', 'stranger'), clean('/app', 'signed-in')]),
    at: '2026-11-06T00:00:00Z',
  };
  assert.match(productReady(stale, { now }).reasons.join(), /older than a day/);
  assert.match(
    productReady(
      receipt([clean('/', 'stranger'), clean('/app', 'signed-in')]),
      { now, deployedSha: 'def' }
    ).reasons.join(),
    /not of the deployed build/
  );
  assert.match(
    productReady(receipt([clean('/', 'stranger')]), { now }).reasons.join(),
    /not crawled signed in/
  );
  assert.match(
    productReady(receipt([clean('/', 'stranger'), clean('/', 'signed-in')]), {
      now,
    }).reasons.join(),
    /1 page routes not crawled/
  );
  assert.equal(productReady(null, { now }).ready, false);
});

test('only a reviewed gap counts as covered; a sign-in wall does not', () => {
  const base = receipt([
    clean('/', 'stranger'),
    clean('/', 'signed-in'),
    {
      route: '/app',
      identity: 'stranger',
      viewport: 'desktop',
      authGated: true,
    },
  ]);
  assert.equal(productReady(base, { now }).ready, false);
  const gap = { route: '/app', reason: 'needs a release id' };
  assert.equal(
    productReady({ ...base, uncovered: [gap] }, { now }).ready,
    false
  );
  assert.equal(
    productReady({ ...base, uncovered: [{ ...gap, accepted: true }] }, { now })
      .ready,
    true
  );
});

test('findings rank broken first', () => {
  const ranked = rankFindings([
    { kind: 'overflow' },
    { kind: 'server-error' },
    { kind: 'layout-shift' },
  ]).map(f => f.kind);
  assert.deepEqual(ranked, ['server-error', 'layout-shift', 'overflow']);
});
