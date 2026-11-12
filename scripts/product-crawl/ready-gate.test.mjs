import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLAIM_BANNER,
  causeOf,
  fromThirdPartyFrame,
  isClosedInProduction,
  median,
  PLACEHOLDER,
  pageFindings,
  productReady,
  rankFindings,
  timingSuspect,
  verticalMove,
} from './ready-gate.mjs';

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

test('a layout-shift finding names the elements that moved', () => {
  const [finding] = pageFindings({
    ...clean('/tim', 'stranger'),
    cls: 0.114,
    clsSources: [
      { node: 'div.subscribe-card', value: 0.09 },
      { node: 'footer', value: 0.024 },
    ],
  });
  assert.equal(finding.kind, 'layout-shift');
  assert.equal(
    finding.detail,
    'CLS 0.114 > 0.1; moved: div.subscribe-card (0.090), footer (0.024)'
  );
});

test('a layout-shift finding says how far and when each element first moved', () => {
  const [finding] = pageFindings({
    ...clean('/tim', 'stranger'),
    cls: 0.114,
    clsSources: [
      { node: 'footer', value: 0.114, dy: 184, atMs: 612 },
      { node: 'div.hero', value: 0.02, dy: -8, atMs: 900 },
    ],
  });
  assert.equal(
    finding.detail,
    'CLS 0.114 > 0.1; moved: footer (0.114, 184px down at 612ms), div.hero (0.020, 8px up at 900ms)'
  );
});

test('a layout-shift finding names the element that appeared just before it', () => {
  const [finding] = pageFindings({
    ...clean('/tim', 'stranger'),
    cls: 0.114,
    clsSources: [
      {
        node: 'footer',
        value: 0.114,
        dy: 200,
        atMs: 1198,
        after: { node: 'form.signup', h: 328, atMs: 1180 },
      },
    ],
  });
  assert.equal(
    finding.detail,
    'CLS 0.114 > 0.1; moved: footer (0.114, 200px down at 1198ms after form.signup (328px) appeared at 1180ms)'
  );
});

test('the cause of a shift is the last element inserted in the half second before it', () => {
  const added = [
    { node: 'p.early', atMs: 100, h: 900 },
    { node: 'section.card', atMs: 943, h: 472 },
    { node: 'span.badge', atMs: 1180, h: 24 },
    { node: 'form.signup', atMs: 1180, h: 328 },
    { node: 'div.later', atMs: 1300, h: 600 },
  ];
  assert.deepEqual(causeOf(added, 1198), {
    node: 'form.signup',
    atMs: 1180,
    h: 328,
  });
  assert.equal(causeOf(added, 50), undefined);
  assert.equal(causeOf(added, undefined), undefined);
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

test('ignores console output only from the challenge frame itself', () => {
  assert.equal(
    fromThirdPartyFrame('https://challenges.cloudflare.com/cdn-cgi/x'),
    true
  );
  assert.equal(
    fromThirdPartyFrame('https://hagen.challenges.cloudflare.com/a'),
    true
  );
  assert.equal(fromThirdPartyFrame('https://jov.ie/start'), false);
  assert.equal(
    fromThirdPartyFrame('https://evilchallenges.cloudflare.com.example/a'),
    false
  );
  assert.equal(fromThirdPartyFrame(undefined), false);
  assert.equal(fromThirdPartyFrame('not a url'), false);
});

test('a reviewed closed-in-production route must keep answering 404', () => {
  const closed = [{ prefix: '/demo', reason: 'internal demo' }];
  assert.equal(isClosedInProduction('/demo/audience', closed), true);
  assert.equal(isClosedInProduction('/demolition', closed), false);
  const index = [{ prefix: '/demo', exact: true, reason: 'index only' }];
  assert.equal(isClosedInProduction('/demo', index), true);
  assert.equal(isClosedInProduction('/demo/video', index), false);
  assert.equal(
    isClosedInProduction('/demo', [{ prefix: '/demo', reason: '' }]),
    false
  );
  const page = { route: '/demo', identity: 'stranger', viewport: 'phone' };
  assert.deepEqual(
    pageFindings({ ...page, status: 404, consoleErrors: ['x'] }, closed),
    []
  );
  assert.equal(
    pageFindings({ ...page, status: 200 }, closed)[0].kind,
    'closed-route-open'
  );
  assert.equal(pageFindings({ ...page, status: 404 })[0].kind, 'broken-route');
});

test('signed in, a sign-in wall is lost session; an unclaimed profile needs its banner', () => {
  const at = {
    route: '/app',
    viewport: 'desktop',
    status: 200,
    authGated: true,
  };
  assert.deepEqual(pageFindings({ ...at, identity: 'stranger' }), []);
  assert.equal(
    pageFindings({ ...at, identity: 'signed-in' })[0].kind,
    'session-lost'
  );
  const profile = {
    route: '/[username]',
    url: '/testartist',
    identity: 'stranger',
    viewport: 'phone',
    status: 200,
    expectClaimBanner: true,
  };
  assert.deepEqual(pageFindings({ ...profile, claimBanner: true }), []);
  assert.equal(
    pageFindings({ ...profile, claimBanner: false })[0].kind,
    'claim-banner-missing'
  );
  assert.equal(
    CLAIM_BANNER.test(
      'This profile is unclaimed. Verified ownership is required'
    ),
    true
  );
});

test('placeholder text is caught at sentence start and around [object Object]', () => {
  for (const text of [
    'Lorem ipsum dolor',
    'Price: [object Object]',
    '[object Object]',
    'Placeholder text here',
    'Total: NaN',
  ])
    assert.match(text, PLACEHOLDER, text);
  for (const text of ['My todo list', 'Nan and Pop', 'An undefinedness'])
    assert.doesNotMatch(text, PLACEHOLDER, text);
});

test('a timing finding is judged on the median of repeat loads', () => {
  assert.equal(median([382, 120, 140]), 140);
  assert.equal(median([210, 90]), 90);
  assert.ok(timingSuspect({ longestTaskMs: 234 }));
  assert.ok(timingSuspect({ lcpMs: 2600 }));
  assert.ok(!timingSuspect({ longestTaskMs: 150, lcpMs: 1800 }));
  assert.ok(!timingSuspect({ error: 'timeout', longestTaskMs: 900 }));
  const at = {
    route: '/pricing',
    identity: 'stranger',
    viewport: 'phone',
    status: 200,
  };
  const kinds = p => pageFindings(p).map(f => f.kind);
  assert.deepEqual(kinds({ ...at, longestTaskMs: 140, timingSamples: 3 }), []);
  const [still] = pageFindings({ ...at, longestTaskMs: 260, timingSamples: 3 });
  assert.equal(still.detail, 'main thread blocked 260ms (median of 3 loads)');
});

test('a crawl that hit its deadline is never ready and says how much was left', () => {
  const r = productReady(
    {
      ...receipt([clean('/', 'stranger'), clean('/app', 'signed-in')]),
      outOfTime: { loadsLeft: 12, resamplesLeft: 3 },
    },
    { now }
  );
  assert.equal(r.ready, false);
  assert.deepEqual(r.reasons, [
    'crawl hit its deadline with 12 page loads not made',
    'crawl hit its deadline with 3 timing suspects judged on one load',
  ]);
});

test('a crawl that finished in time adds no deadline reason', () => {
  const r = productReady(
    {
      ...receipt([clean('/', 'stranger'), clean('/app', 'signed-in')]),
      outOfTime: null,
    },
    { now }
  );
  assert.equal(r.ready, true);
});

test('a sideways move or a resize in place records no vertical move, so a later real one is kept', () => {
  assert.equal(verticalMove({ y: 100 }, { y: 100 }), undefined);
  assert.equal(verticalMove({ y: 100 }, { y: 100.4 }), undefined);
  assert.equal(verticalMove(undefined, { y: 300 }), undefined);
  assert.equal(verticalMove({ y: 100 }, { y: 300 }), 200);
  assert.equal(verticalMove({ y: 300 }, { y: 100 }), -200);
});

test('a frozen-frame finding names the scripts that ran in the longest frame', () => {
  const page = {
    route: '/app/library',
    identity: 'signed-in',
    viewport: 'desktop',
    status: 200,
    longestTaskMs: 267,
    timingSamples: 3,
    frame: {
      ms: 310,
      atMs: 820,
      layoutMs: 22,
      scripts: [
        {
          src: '0abc.js',
          fn: 'UnifiedTable',
          invoker: 'MessagePort.onmessage',
          ms: 180,
        },
        { src: '0def.js', fn: '', invoker: 'classic-script', ms: 61 },
      ],
    },
  };
  const finding = pageFindings(page).find(f => f.kind === 'frozen-frame');
  assert.equal(
    finding.detail,
    'main thread blocked 267ms (median of 3 loads); longest frame 310ms at 820ms (layout 22ms): UnifiedTable in 0abc.js via MessagePort.onmessage 180ms, 0def.js via classic-script 61ms'
  );
  const bare = pageFindings({ ...page, frame: undefined }).find(
    f => f.kind === 'frozen-frame'
  );
  assert.equal(bare.detail, 'main thread blocked 267ms (median of 3 loads)');
});
