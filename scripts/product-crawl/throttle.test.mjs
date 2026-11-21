import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createDirectFetch } from './direct-fetch.mjs';
import { judgeOnQuietReload, wasThrottled } from './throttle.mjs';
import {
  createTrafficEvidence,
  firstPartyMetadata,
  mergeTrafficEvidence,
} from './traffic-evidence.mjs';

test('a 429 that clears on a quiet reload is not a finding', () => {
  const row = {
    failedRequests: ['429 /api/profile/capture-dismissal', '404 /x.png'],
  };
  assert.equal(wasThrottled(row), true);
  judgeOnQuietReload(row, { failedRequests: [] });
  assert.deepEqual(row.failedRequests, ['404 /x.png']);
  assert.deepEqual(row.throttledRequests, [
    '429 /api/profile/capture-dismissal',
  ]);
});

test('a 429 that survives the quiet reload stays a finding', () => {
  const row = { failedRequests: ['429 /api/profile/capture-dismissal'] };
  judgeOnQuietReload(row, {
    failedRequests: ['429 /api/profile/capture-dismissal', '500 /api/other'],
  });
  assert.deepEqual(row.failedRequests, ['429 /api/profile/capture-dismissal']);
});

test('a page with no 429 is not re-loaded', () => {
  assert.equal(wasThrottled({ failedRequests: ['500 /api/x'] }), false);
  assert.equal(wasThrottled({}), false);
});

test("the browser's console line for a 429 is judged on the quiet reload too", () => {
  const throttledLine =
    'Failed to load resource: the server responded with a status of 429 () (/api/shop)';
  const row = {
    failedRequests: ['429 /api/shop'],
    consoleErrors: [throttledLine, 'TypeError: x'],
  };
  judgeOnQuietReload(row, { failedRequests: [], consoleErrors: [] });
  assert.deepEqual(row.consoleErrors, ['TypeError: x']);
  judgeOnQuietReload(row, {
    failedRequests: ['429 /api/shop'],
    consoleErrors: [throttledLine],
  });
  assert.deepEqual(row.consoleErrors, ['TypeError: x', throttledLine]);
});

const origin = 'https://fixture.invalid';
const make = opts =>
  createTrafficEvidence({ origin, pageIntervalMs: 0, ...opts });

test('direct bodies, clones and bodyless responses finish with wire sizes unknown', async () => {
  const evidence = make();
  const fetch = createDirectFetch({
    origin,
    evidence,
    fetchImpl: async url =>
      new Response(url.endsWith('/empty') ? null : 'fixture', {
        status: url.endsWith('/empty') ? 204 : 200,
      }),
  });
  const stream = await fetch(`${origin}/stream`);
  const reader = stream.body.getReader();
  while (!(await reader.read()).done) {
    /* consume the actual public stream API */
  }
  await (await fetch(`${origin}/clone`)).clone().text();
  await fetch(`${origin}/empty`);
  const { observed, accounting } = evidence.snapshot();
  assert.equal(observed.attempted, 3);
  assert.equal(observed.inFlight, 0);
  assert.equal(observed.requestsWithSizes, 0);
  assert.equal(observed.requestsWithoutSizes, 3);
  assert.equal(accounting.browserProcessRequests.attempted, null);
});

test('pacing rechecks request admission after its queued pause', async () => {
  let time = 0;
  let pause;
  const evidence = make({
    maxInterceptedRequests: 1,
    pageIntervalMs: 100,
    now: () => time,
    sleep: async ms => {
      pause = ms;
      evidence.admit({});
      time += ms;
    },
  });
  assert.equal((await evidence.pace()).allowed, true);
  assert.equal((await evidence.pace()).allowed, false);
  assert.equal(pause, 100);
  assert.equal(evidence.snapshot().admission.visitsNotStarted, 1);
});

test('known events retain redirects, HTTP/transport failures and available response sizes separately', async () => {
  const evidence = make();
  const context = new EventEmitter();
  evidence.observe(context);
  const request = {
    url: () => origin,
    resourceType: () => 'document',
    sizes: async () => ({ responseBodySize: 10, responseHeadersSize: 20 }),
  };
  context.emit('request', request);
  context.emit('response', {
    request: () => request,
    status: () => 302,
    fromServiceWorker: () => false,
  });
  context.emit('requestfinished', request);
  const fail = { url: () => `${origin}/asset`, resourceType: () => 'script' };
  context.emit('request', fail);
  context.emit('requestfailed', fail);
  await evidence.settle();
  assert.deepEqual(
    Object.fromEntries(
      [
        'attempted',
        'pages',
        'assets',
        'redirects',
        'failures',
        'inFlight',
        'responseBodyBytes',
        'responseHeaderBytes',
        'requestsWithSizes',
        'requestsWithoutSizes',
      ].map(k => [k, evidence.snapshot().observed[k]])
    ),
    {
      attempted: 2,
      pages: 1,
      assets: 1,
      redirects: 1,
      failures: 1,
      inFlight: 0,
      responseBodyBytes: 10,
      responseHeaderBytes: 20,
      requestsWithSizes: 1,
      requestsWithoutSizes: 1,
    }
  );
});

test('merging preserves per-shard pacing and every instrumentation gap', () => {
  const a = make({ pageIntervalMs: 1000 });
  const b = make({ pageIntervalMs: 1000 });
  a.instrumentationError('first');
  b.instrumentationError('second');
  const merged = mergeTrafficEvidence([
    { traffic: a.snapshot() },
    { traffic: b.snapshot() },
    {},
  ]);
  assert.equal(merged.admission.pageIntervalMs, 1000);
  assert.deepEqual(merged.accounting.instrumentationErrors, [
    'first',
    'second',
  ]);
  assert.equal(merged.accounting.missingShardLedgers, 1);
  assert.equal(merged.accounting.absoluteAllNetworkCapEnforced, false);
});

test('custom metadata is exact-origin only and rejects unsafe invocation values', () => {
  assert.deepEqual(
    firstPartyMetadata(
      'https://foreign.invalid/',
      origin,
      { accept: '*' },
      { run: '12' }
    ),
    { accept: '*' }
  );
  assert.deepEqual(
    firstPartyMetadata(
      `${origin}/`,
      origin,
      {},
      { run: '12', deployment: 'bad\r\nvalue' }
    ),
    { 'x-synthetic-monitoring': 'product-crawl', 'x-jovie-crawl-run': '12' }
  );
});
