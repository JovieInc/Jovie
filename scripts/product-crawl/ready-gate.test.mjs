import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLAIM_BANNER,
  fromThirdPartyFrame,
  isClosedInProduction,
  PLACEHOLDER,
  pageFindings,
  productReady,
  rankFindings,
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
