import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  fakePage,
  row,
  stalledContext,
  withWalkDir,
} from './fixtures/overlay-page.mjs';
import { findOrphanedOverlays } from './orphaned-overlays.mjs';
import {
  overlayWalkSummary,
  pickWalkTargets,
  runOverlayWalks,
  safePaths,
  walkPage,
} from './overlay-walk.mjs';
import { overlayWalkFindings, productReady } from './ready-gate.mjs';

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
  assert.equal(bad.length, 1);
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

test('persistent orphans leave the screenshot budget for later distinct findings', async () => {
  const page = fakePage({ sticky: true });
  const evaluate = page.evaluate;
  let checks = 0;
  page.waitForTimeout = async ms => {
    if (ms === 500) checks += 1;
  };
  page.evaluate = async (fn, arg) => {
    if (fn !== findOrphanedOverlays) return evaluate(fn, arg);
    return [2, 7, 10]
      .filter(first => checks >= first)
      .map(first => ({
        kind: 'tooltip',
        overlay: `div#orphan-${first}`,
        box: [0, 0, 40, 20],
        text: '',
        reason: 'anchor-missing',
        anchor: null,
      }));
  };
  const shots = [];
  const walk = await walkPage(page, {
    safe: ['/app/releases'],
    shot: async name => {
      shots.push(name);
      return name;
    },
  });
  const bad = walk.steps.filter(s => s.orphans);
  assert.deepEqual(
    bad.flatMap(s => s.orphans.map(o => o.overlay)),
    ['div#orphan-2', 'div#orphan-7', 'div#orphan-10']
  );
  assert.equal(shots.length, 3);
  assert.ok(bad.every(s => s.screenshot));
});

test('a walk stops before a settle/recheck cannot fit and keeps earlier steps', async () => {
  const page = fakePage({ sticky: true });
  let now = 0;
  page.waitForTimeout = async ms => {
    now += ms;
  };
  const walk = await walkPage(page, { deadlineEpochMs: 1200, now: () => now });
  assert.equal(walk.stoppedForTime, true);
  assert.equal(walk.error, undefined);
  assert.equal(walk.steps.length, 1);
  assert.ok(now < 1200);
});

test('near-deadline targets are explicitly skipped without creating a browser context', async () => {
  await withWalkDir(async out => {
    let opened = 0;
    const pages = ['/app', '/pricing'].map(url =>
      row(url, 'stranger', { rail: true })
    );
    const result = await runOverlayWalks({
      pages,
      origin: 'https://crawl.test',
      out,
      deadlineEpochMs: 40_000,
      now: () => 5001,
      openContext: async () => {
        opened += 1;
        throw new Error('must not open');
      },
    });
    assert.equal(opened, 0);
    assert.equal(result.left, 2);
    assert.deepEqual(result.walks, []);
    assert.deepEqual(
      result.skipped.map(s => [s.url, s.reason]),
      [
        ['/app', 'deadline'],
        ['/pricing', 'deadline'],
      ]
    );
    assert.match(
      overlayWalkSummary(result, true),
      /2 not walked before the deadline/
    );
  });
});

test('one deadline timer closes a stalled navigation and stops later batches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWalkDir(async out => {
    let now = 0;
    let opened = 0;
    let closed = 0;
    let started;
    const navigating = new Promise(resolve => {
      started = resolve;
    });
    const pending = runOverlayWalks({
      pages: ['/one', '/two', '/tri', '/four'].map(url =>
        row(url, 'stranger', { rail: true })
      ),
      origin: 'https://crawl.test',
      out,
      deadlineEpochMs: 40_000,
      now: () => now,
      openContext: async () => {
        opened += 1;
        return stalledContext({
          started,
          closed: () => {
            closed += 1;
          },
        });
      },
    });
    await navigating;
    now = 40_000;
    t.mock.timers.tick(40_000);
    const result = await pending;
    assert.equal(opened, 3);
    assert.equal(closed, 3);
    assert.equal(result.walks.length, 3);
    assert.ok(result.walks.every(w => w.stoppedForTime));
    assert.equal(result.left, 1);
    assert.equal(result.skipped[0].url, '/four');
    assert.match(overlayWalkSummary(result, true), /3 stopped at the deadline/);
  });
});

test('a context that opens after the deadline closes without starting a request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWalkDir(async out => {
    let now = 0;
    /** @type {(context: any) => void} */
    let open = () => assert.fail('context creation did not start');
    let notifyStarted;
    let notifyClosed;
    const started = new Promise(resolve => {
      notifyStarted = resolve;
    });
    const closed = new Promise(resolve => {
      notifyClosed = resolve;
    });
    const pending = runOverlayWalks({
      pages: [row('/app', 'stranger', { rail: true })],
      origin: 'https://crawl.test',
      out,
      deadlineEpochMs: 40_000,
      now: () => now,
      openContext: () => {
        notifyStarted();
        return new Promise(resolve => {
          open = resolve;
        });
      },
    });
    await started;
    now = 40_000;
    t.mock.timers.tick(40_000);
    const result = await pending;
    assert.equal(result.walks[0].stoppedForTime, true);
    open({
      addCookies: async () =>
        assert.fail('late context must not configure a page'),
      newPage: async () => assert.fail('late context must not open a page'),
      close: async () => notifyClosed(),
    });
    await closed;
  });
});

test('finite-deadline walks finish normally and preserve navigation failures', async () => {
  await withWalkDir(async out => {
    const pages = [row('/app', 'stranger', { rail: true })];
    const page = fakePage({ sticky: false });
    let closed = 0;
    page.setDefaultTimeout = ms => assert.equal(ms, 5000);
    page.goto = async (_url, options) => assert.equal(options.timeout, 30_000);
    page.screenshot = async () => {};
    const context = {
      addCookies: async () => {},
      newPage: async () => page,
      close: async () => {
        closed += 1;
      },
    };
    const result = await runOverlayWalks({
      pages,
      origin: 'https://crawl.test',
      out,
      deadlineEpochMs: 50_000,
      now: () => 0,
      openContext: async () => context,
    });
    assert.equal(result.walks[0].stoppedForTime, undefined);
    assert.equal(result.walks[0].error, undefined);
    assert.ok(result.walks[0].steps.length > 0);
    assert.equal(result.left, 0);
    assert.equal(closed, 1);

    page.goto = async () => {
      throw new Error('net::ERR_FAILED\nstack');
    };
    const failed = await runOverlayWalks({
      pages,
      origin: 'https://crawl.test',
      out,
      openContext: async () => context,
    });
    assert.equal(failed.walks[0].error, 'net::ERR_FAILED');
    assert.equal(failed.walks[0].stoppedForTime, undefined);
    assert.equal(closed, 2);

    context.close = async () => {
      throw new Error('close rejected\nstack');
    };
    const uncertain = await runOverlayWalks({
      pages,
      origin: 'https://crawl.test',
      out,
      openContext: async () => context,
    });
    assert.equal(uncertain.walks[0].cleanupPending, true);
    assert.equal(uncertain.walks[0].cleanupError, 'close rejected');
    assert.match(
      overlayWalkSummary(uncertain, true),
      /1 context cleanups not confirmed/
    );
  });
});

test('runner captures distinct orphans and a screenshot failure does not erase the finding', async () => {
  await withWalkDir(async out => {
    for (const reject of [false, true]) {
      const page = fakePage({ sticky: true });
      page.setDefaultTimeout = () => {};
      page.goto = async () => {};
      page.screenshot = async options => {
        assert.equal(options.timeout, 5000);
        assert.match(options.path, /00-tooltip-then-collapse-/);
        if (reject) throw new Error('capture failed');
      };
      const result = await runOverlayWalks({
        pages: [row('/app', 'stranger', { rail: true })],
        origin: 'https://crawl.test',
        out,
        openContext: async () => ({
          addCookies: async () => {},
          newPage: async () => page,
          close: async () => {},
        }),
      });
      const bad = result.walks[0].steps.filter(s => s.orphans);
      assert.equal(bad.length, 1);
      if (reject) assert.equal(bad[0].screenshot, null);
      else
        assert.match(
          bad[0].screenshot,
          /^overlay-walk\/00-tooltip-then-collapse-/
        );
    }
  });
});

test('the existing deadline returns incomplete evidence when context close never acknowledges', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withWalkDir(async out => {
    for (const stalledNavigation of [true, false]) {
      let now = 0;
      let closeCalls = 0;
      let reachedStage;
      const stage = new Promise(resolve => {
        reachedStage = resolve;
      });
      const page = fakePage({ sticky: false });
      page.setDefaultTimeout = () => {};
      page.goto = async () => {
        if (stalledNavigation) {
          reachedStage();
          return new Promise(() => {});
        }
      };
      const pending = runOverlayWalks({
        pages: [row('/app', 'stranger', { rail: true })],
        origin: 'https://crawl.test',
        out,
        deadlineEpochMs: 40_000,
        now: () => now,
        openContext: async () => ({
          addCookies: async () => {},
          newPage: async () => page,
          close: () => {
            closeCalls += 1;
            reachedStage();
            return new Promise(() => {});
          },
        }),
      });
      let settled = false;
      pending.then(() => {
        settled = true;
      });
      await stage;
      now = 40_000;
      t.mock.timers.tick(40_000);
      // Drain one event-loop turn, with no elapsed-time assertion or sleep.
      await nextTurn();
      assert.equal(settled, true, 'receipt must not wait for a stuck close');
      const result = await pending;
      assert.equal(closeCalls, 1);
      assert.equal(result.walks[0].stoppedForTime, true);
      assert.equal(result.walks[0].cleanupPending, true);
      if (!stalledNavigation) assert.ok(result.walks[0].steps.length > 0);
    }
  });
});
