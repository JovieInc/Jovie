import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createDirectFetch } from './direct-fetch.mjs';
import { adoptionFixture } from './fixtures/receipt-adoption.mjs';
import { lookupPublicReceipt } from './receipt-adoption.mjs';
import { receiptAt } from './receipt-producer.mjs';
import {
  PUBLIC_REUSE_MAX_AGE_MS,
  publicPacket,
  readPublicAdoption,
} from './receipt-reuse.mjs';
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

test('missing signed-in measurements cannot certify an original for public reuse', () => {
  const f = adoptionFixture();
  delete f.document.pages.find(p => p.identity === 'signed-in').cls;
  assert.equal(lookupPublicReceipt({ ...f }), null);
});

test('validated original provenance yields only bounded stranger data for this invocation', () => {
  const f = adoptionFixture();
  f.document.pages.find(p => p.identity === 'signed-in').privateCookie =
    'private-session-state';
  f.document.pages[0].collected = { secret: 'private-discovery-state' };
  f.document.privateState = 'private-producer-state';
  const packet = lookupPublicReceipt({ ...f });
  assert.ok(packet);
  assert.equal(f.calls(), 3);
  const json = JSON.stringify(packet);
  assert.doesNotMatch(json, /private-|signed-in|collected/);
  const consumer = readPublicAdoption(
    Buffer.from(json).toString('base64'),
    { ...f.scope, shard: { index: 1, count: 4 } },
    f.inventory,
    () => f.now
  );
  const job = {
    route: '/',
    target: '/',
    viewport: 'desktop',
    identity: 'stranger',
  };
  const row = consumer.find(job);
  assert.equal(row.measurementAdoption.runId, 10);
  assert.equal(Date.parse(receiptAt(f.now, [row])), Date.parse(row.measuredAt));
  for (const mismatch of [
    { identity: 'signed-in' },
    { collect: true },
    { target: '/?x=1' },
    { target: '/#part' },
    { fixture: 'unclaimed' },
    { viewport: 'tablet' },
    { route: '/other' },
  ])
    assert.equal(consumer.find({ ...job, ...mismatch }), null);
  assert.equal(
    readPublicAdoption(
      Buffer.from(json).toString('base64'),
      { ...f.scope, invocation: { ...f.scope.invocation, runId: 21 } },
      f.inventory,
      () => f.now
    ),
    null
  );
});

for (const [
  name,
  breakEvidence,
] of /** @type {Array<[string, (f:any)=>void]>} */ ([
  [
    'legacy stamp',
    f => {
      delete f.document.producerScope;
    },
  ],
  [
    'source checkout',
    f => {
      f.document.producerScope.sourceSha = 'd'.repeat(40);
    },
  ],
  [
    'deployment',
    f => {
      f.document.producerScope.target.deploymentId = 'dpl_other';
    },
  ],
  [
    'producer',
    f => {
      f.document.producerScope.target.policyDigest = 'd'.repeat(64);
    },
  ],
  [
    'missing phone',
    f => {
      f.document.pages = f.document.pages.filter(p => p.viewport !== 'phone');
    },
  ],
  [
    'missing start time',
    f => {
      delete f.document.pages[0].measuredAt;
    },
  ],
  [
    'future measurement',
    f => {
      f.document.pages[0].measuredAt = '2099-01-01T00:00:00Z';
    },
  ],
  [
    'wrong full target',
    f => {
      f.document.pages[0].url = '/wrong';
    },
  ],
  [
    'reviewed policy mismatch',
    f => {
      f.document.closedInProduction = [];
    },
  ],
  [
    'prior adoption',
    f => {
      f.document.publicAdoption = { count: 1 };
    },
  ],
  [
    'wrong run attempt',
    f => {
      f.run.run_attempt = 2;
    },
  ],
  [
    'foreign workflow',
    f => {
      f.run.path = '.github/workflows/other.yml';
    },
  ],
  [
    'fork',
    f => {
      f.run.head_repository.full_name = 'foreign/Jovie';
    },
  ],
  [
    'wrong artifact head',
    f => {
      f.artifact.workflow_run.head_sha = 'd'.repeat(40);
    },
  ],
]))
  test(`${name} never substitutes for current crawl coverage`, () => {
    const f = adoptionFixture();
    breakEvidence(f);
    assert.equal(lookupPublicReceipt({ ...f }), null);
  });

test('original measurement age expires without renewal and unknown transport stays cold', () => {
  const f = adoptionFixture();
  const original = Date.parse(f.document.at);
  assert.ok(
    publicPacket(
      f.document,
      f.scope,
      f.inventory,
      f.source,
      original + PUBLIC_REUSE_MAX_AGE_MS
    )
  );
  assert.equal(
    publicPacket(
      f.document,
      f.scope,
      f.inventory,
      f.source,
      original + PUBLIC_REUSE_MAX_AGE_MS + 1
    ),
    null
  );
  assert.equal(lookupPublicReceipt({ ...f, force: true }), null);
  assert.equal(f.calls(), 0);
  assert.equal(
    lookupPublicReceipt({
      ...f,
      transport: {
        getJson() {
          throw new Error('quota deferred');
        },
      },
    }),
    null
  );
  const packet = publicPacket(
    f.document,
    f.scope,
    f.inventory,
    f.source,
    f.now
  );
  packet.rows[0].cookie = 'private';
  assert.equal(
    readPublicAdoption(
      Buffer.from(JSON.stringify(packet)).toString('base64'),
      f.scope,
      f.inventory,
      () => f.now
    ),
    null
  );
  assert.equal(
    readPublicAdoption('!invalid', f.scope, f.inventory, () => f.now),
    null
  );
});

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

test('an original requires desktop walk evidence and every shard ledger', () => {
  const f = adoptionFixture();
  const row = f.document.pages.find(
    p =>
      p.route === '/pricing' &&
      p.identity === 'stranger' &&
      p.viewport === 'desktop'
  );
  row.overlaySurface.hoverables = 2;
  f.document.overlayWalks.walks = [
    {
      route: '/pricing',
      url: '/pricing',
      identity: 'stranger',
      viewport: 'desktop',
      steps: [{ step: 'loaded', sequence: 'baseline' }],
    },
  ];
  assert.ok(lookupPublicReceipt({ ...f }));
  f.document.overlayWalks.walks[0].viewport = 'phone';
  assert.equal(lookupPublicReceipt({ ...f }), null);
  f.document.overlayWalks.walks[0].viewport = 'desktop';
  f.document.traffic.accounting.missingShardLedgers = 1;
  assert.equal(lookupPublicReceipt({ ...f }), null);
});

test('oversize public hints and malformed scope never change current coverage', () => {
  const f = adoptionFixture();
  const packet = publicPacket(
    f.document,
    f.scope,
    f.inventory,
    f.source,
    f.now
  );
  const consumerScope = { ...f.scope, shard: { index: 1, count: 4 } };
  const clock = () => f.now;
  assert.equal(
    readPublicAdoption('eA=='.repeat(20000), consumerScope, f.inventory, clock),
    null
  );
  packet.scope.config.extraSession = 'private';
  assert.equal(
    readPublicAdoption(
      Buffer.from(JSON.stringify(packet)).toString('base64'),
      consumerScope,
      f.inventory,
      clock
    ),
    null
  );
});
