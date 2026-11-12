import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findOrphanedOverlays } from './orphaned-overlays.mjs';
import {
  overlayWalkSummary,
  pickWalkTargets,
  RAIL,
  safePaths,
  walkPage,
} from './overlay-walk.mjs';
import { overlayWalkFindings, productReady } from './ready-gate.mjs';

const row = (url, identity, overlaySurface, more = {}) => ({
  route: url,
  url,
  identity,
  viewport: 'desktop',
  status: 200,
  overlaySurface,
  ...more,
});

test('walks sidebar pages first, one per section, per identity', () => {
  const pages = [
    row('/pricing', 'stranger', { rail: false, hoverables: 4 }),
    row('/about', 'stranger', { rail: false, hoverables: 0 }),
    row('/app/settings/billing', 'signed-in', { rail: true, hoverables: 9 }),
    row('/app/settings', 'signed-in', { rail: true, hoverables: 2 }),
    row('/app', 'signed-in', { rail: true, hoverables: 1 }),
    row('/pricing', 'signed-in', { rail: false, hoverables: 4 }),
    row('/app/audience', 'signed-in', { rail: true }, { authGated: true }),
    row('/app/x', 'signed-in', { rail: true }, { viewport: 'phone' }),
    row('/app/broken', 'signed-in', { rail: true }, { status: 500 }),
  ];
  assert.deepEqual(
    pickWalkTargets(pages).map(t => `${t.identity} ${t.url}`),
    [
      'stranger /pricing',
      'signed-in /app',
      'signed-in /app/settings',
      'signed-in /pricing',
    ]
  );
  assert.equal(pickWalkTargets(pages, { max: 1 }).length, 2);
});

test('a walk only navigates to pages the crawl loaded as that identity', () => {
  const pages = [
    row('/app', 'signed-in', {}),
    row('/app/releases?tab=all', 'signed-in', {}),
    row('/app/settings/delete-account', 'signed-in', {}),
    row('/app/gated', 'signed-in', {}, { authGated: true }),
    row('/pricing', 'stranger', {}),
  ];
  assert.deepEqual(
    safePaths(pages, 'signed-in', r => /delete/.test(r)),
    ['/app', '/app/releases']
  );
});

/**
 * A scripted stand-in for a Playwright page with an unpinned sidebar holding
 * two hover triggers. `sticky` is the bug: the tooltip outlives the sidebar.
 */
function fakePage({ sticky }) {
  const state = { rail: false, layers: 0, path: '/app', log: [] };
  const leave = () => {
    state.rail = false;
    if (!sticky) state.layers = 0;
  };
  const railLocator = {
    first: () => railLocator,
    isVisible: async () => true,
    getAttribute: async () => 'false',
    hover: async () => {
      state.rail = true;
    },
  };
  const triggers = {
    count: async () => (state.rail ? 2 : 0),
    nth: i => ({
      hover: async () => {
        state.log.push(`hover trigger ${i}`);
        state.layers = 1;
      },
    }),
  };
  return {
    state,
    mouse: { move: async () => leave() },
    keyboard: {
      press: async () => {
        state.layers = 0;
      },
    },
    waitForTimeout: async () => {},
    setViewportSize: async () => leave(),
    locator: sel => (sel === RAIL ? railLocator : triggers),
    waitForSelector: async () => {
      if (!state.rail) throw new Error('timeout');
    },
    waitForFunction: async (_fn, [, before]) => {
      if (!(state.layers > before)) throw new Error('timeout');
    },
    waitForURL: async () => {},
    evaluate: async (fn, arg) => {
      if (fn === findOrphanedOverlays)
        return state.layers && !state.rail
          ? [
              {
                kind: 'tooltip',
                overlay: 'div',
                text: "What's new",
                reason: 'anchor-missing',
                anchor: null,
                box: [0, 0, 90, 28],
              },
            ]
          : [];
      if (typeof arg === 'string') return state.layers;
      state.path = '/app/releases';
      return state.path;
    },
  };
}

test('the tooltip that outlives the collapsing sidebar is recorded with its steps', async () => {
  const shots = [];
  const walk = await walkPage(fakePage({ sticky: true }), {
    safe: ['/app/releases'],
    shot: async name => {
      shots.push(name);
      return `overlay-walk/00-${name}.png`;
    },
  });
  assert.equal(walk.error, undefined);
  assert.equal(walk.rail, 'peek');
  const bad = walk.steps.filter(s => s.orphans);
  assert.ok(bad.length >= 2);
  assert.deepEqual(bad[0].trail, [
    'hover-open sidebar',
    'hover tooltip trigger',
    'collapse sidebar',
  ]);
  assert.equal(bad[0].sequence, 'tooltip-then-collapse');
  assert.match(bad[0].screenshot, /^overlay-walk\/00-tooltip-then-collapse-/);
  assert.equal(shots.length, Math.min(bad.length, 3));

  const findings = overlayWalkFindings({
    route: '/app',
    identity: 'signed-in',
    ...walk,
  });
  assert.equal(findings[0].kind, 'orphaned-overlay');
  assert.match(
    findings[0].detail,
    /^tooltip "What's new" left on screen \(anchor-missing\) after: hover-open sidebar > hover tooltip trigger > collapse sidebar; screenshot overlay-walk\//
  );
});

test('every sequence runs and a page that cleans up after itself is clean', async () => {
  const page = fakePage({ sticky: false });
  const walk = await walkPage(page, { safe: ['/app/releases'] });
  assert.equal(walk.error, undefined);
  assert.deepEqual(
    walk.steps.filter(s => s.orphans),
    []
  );
  assert.deepEqual(
    [...new Set(walk.steps.map(s => s.sequence))],
    [
      'sidebar-peek',
      'tooltip-then-collapse',
      'resize',
      'escape',
      'navigate-away',
    ]
  );
  assert.deepEqual(
    walk.steps.filter(s => s.sequence === 'resize').map(s => s.step),
    ['hover tooltip trigger', 'resize to phone', 'resize to desktop']
  );
  assert.equal(walk.steps.at(-1).step, 'navigate away to /app/releases');
  // Both sidebar triggers were tried in the founder's sequence.
  assert.ok(page.state.log.includes('hover trigger 1'));
  assert.ok(walk.opened >= 5);
});

test('a walk that breaks keeps its steps and names where it stopped', async () => {
  const page = fakePage({ sticky: false });
  page.setViewportSize = async () => {
    throw new Error('Target closed\nstack');
  };
  const walk = await walkPage(page);
  assert.equal(walk.error, 'resize: Target closed');
  assert.ok(walk.steps.length > 0);
});

test('an orphaned overlay makes the product not ready', () => {
  const receipt = {
    origin: 'https://jov.ie',
    at: new Date().toISOString(),
    routes: ['/app'],
    pages: [
      { route: '/app', identity: 'stranger', viewport: 'desktop', status: 200 },
      {
        route: '/app',
        identity: 'signed-in',
        viewport: 'desktop',
        status: 200,
      },
    ],
    overlayWalks: {
      walks: [{ route: '/app', identity: 'signed-in', steps: [] }],
    },
  };
  assert.equal(productReady(receipt).ready, true);
  receipt.overlayWalks.walks[0].steps.push({
    step: 'collapse sidebar',
    orphans: [
      {
        kind: 'menu',
        text: '',
        overlay: 'div#m',
        reason: 'anchor-hidden',
        anchor: 'button',
      },
    ],
  });
  const verdict = productReady(receipt);
  assert.equal(verdict.ready, false);
  assert.equal(
    verdict.findings[0].detail,
    'menu div#m left on screen (anchor-hidden: button) after: collapse sidebar'
  );
});

test('the summary says what the walks could not reach', () => {
  const walks = [
    { rail: 'peek', opened: 3, steps: [{}, {}] },
    { rail: 'none', opened: 0, steps: [], error: 'x' },
  ];
  assert.equal(
    overlayWalkSummary({ walks, left: 2 }, false),
    'Overlay walks: 2 pages (1 peeked the sidebar open, 1 raised an overlay), 2 steps checked; 1 stopped on an error; 2 not walked before the deadline; the app shell sidebar was not walked (no signed-in session).'
  );
  assert.equal(
    overlayWalkSummary({ walks: [walks[0]], left: 0 }, true),
    'Overlay walks: 1 pages (1 peeked the sidebar open, 1 raised an overlay), 2 steps checked.'
  );
});
