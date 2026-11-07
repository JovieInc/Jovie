import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyRoutes,
  compareSection,
  globToRegExp,
  matchesAny,
  validateBindings,
} from './pen-diff-lib.mjs';
import { encodePng, fillRect, solidImage } from './pen-still-diff-lib.mjs';

const T = { ssimMin: 0.82, boxAspectTolerance: 0.1 };
const card = (w, h, x) => {
  const img = solidImage(w, h, [3, 4, 6, 255]);
  fillRect(img, x, 8, 30, 20, [200, 210, 230, 255]);
  fillRect(img, 4, 40, 40, 4, [245, 247, 251, 255]);
  return img;
};
const approved = { by: 'tim', at: '2026-11-07T12:00:00Z', receipt: 'r1' };
const entry = (over = {}) => ({
  enforce: true,
  sources: ['apps/web/app/(home)/**'],
  approved,
  viewports: {
    1440: [{ section: 'hero', still: 's.png', sha256: 'ab' }],
    390: [],
  },
  ...over,
});
const cfg = { ignoreSourceGlobs: ['**/*.test.*'] };
const pricing = {
  sources: ['apps/web/app/(marketing)/pricing/**'],
  viewports: {},
};

test('globs: ** crosses dirs, * does not, brackets and parens are literal', () => {
  assert.ok(
    globToRegExp('apps/web/app/(home)/**').test('apps/web/app/(home)/a/b.tsx')
  );
  assert.ok(!globToRegExp('apps/*/x.ts').test('apps/a/b/x.ts'));
  assert.ok(
    globToRegExp('apps/web/app/[username]/**').test(
      'apps/web/app/[username]/page.tsx'
    )
  );
  assert.ok(matchesAny('a/b.test.ts', ['**/*.test.*']));
});

test('bindings validation rejects bad shape and accepts good shape', () => {
  assert.equal(validateBindings({ schema: 'nope', routes: {} }).ok, false);
  assert.equal(validateBindings(null).ok, false);
  const bad = validateBindings({
    schema: 'jovie.pen-binding/v1',
    routes: { '/': { sources: 'x' } },
  });
  assert.equal(bad.ok, false);
  assert.equal(
    validateBindings({
      schema: 'jovie.pen-binding/v1',
      routes: { '/': entry() },
    }).ok,
    true
  );
  const noViewport = entry({ viewports: { 1440: [{ section: 'hero' }] } });
  assert.equal(
    validateBindings({
      schema: 'jovie.pen-binding/v1',
      routes: { '/': noViewport },
    }).ok,
    false
  );
});

test('bound route with matching changed source is checked', () => {
  const r = classifyRoutes({
    bindings: { routes: { '/': entry() } },
    config: cfg,
    changedFiles: ['apps/web/app/(home)/page.tsx'],
    stillChangedAt: {},
  });
  assert.deepEqual(
    r.toCheck.map(x => x.route),
    ['/']
  );
  assert.equal(r.failures.length, 0);
});

test('unrelated and test-only changes do not trigger the gate', () => {
  const r = classifyRoutes({
    bindings: { routes: { '/': entry() } },
    config: cfg,
    changedFiles: ['README.md', 'apps/web/app/(home)/x.test.tsx'],
    stillChangedAt: {},
  });
  assert.equal(r.toCheck.length, 0);
  assert.equal(r.failures.length, 0);
});

test('enforced route without approval fails with the exact message', () => {
  const r = classifyRoutes({
    bindings: { routes: { '/pricing': { ...pricing, enforce: true } } },
    config: cfg,
    changedFiles: ['apps/web/app/(marketing)/pricing/page.tsx'],
    stillChangedAt: {},
  });
  assert.deepEqual(
    r.failures.map(f => f.message),
    ['no approved Pen design for /pricing']
  );
});

test('non-enforced route without approval only warns', () => {
  for (const enforce of [false, undefined]) {
    const r = classifyRoutes({
      bindings: { routes: { '/pricing': { ...pricing, enforce } } },
      config: cfg,
      changedFiles: ['apps/web/app/(marketing)/pricing/page.tsx'],
      stillChangedAt: {},
    });
    assert.equal(r.failures.length, 0);
    assert.match(
      r.warnings[0].message,
      /no approved Pen design for \/pricing \(not enforced\)/
    );
  }
});

test('non-enforced approved route is still rendered but flagged advisory; stale approval only warns', () => {
  const r = classifyRoutes({
    bindings: { routes: { '/': entry({ enforce: false }) } },
    config: cfg,
    changedFiles: ['apps/web/app/(home)/page.tsx', 's.png'],
    stillChangedAt: { 's.png': '2026-11-07T13:00:00Z' },
  });
  assert.equal(r.failures.length, 0);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.toCheck[0].enforced, false);
});

test('binding present but without approved is unbound', () => {
  const r = classifyRoutes({
    bindings: { routes: { '/': entry({ approved: undefined }) } },
    config: cfg,
    changedFiles: ['apps/web/app/(home)/page.tsx'],
    stillChangedAt: {},
  });
  assert.deepEqual(
    r.failures.map(f => f.message),
    ['no approved Pen design for /']
  );
  assert.equal(r.toCheck.length, 0);
});

test('still changed with sources: stale approval fails, fresh passes', () => {
  const base = {
    bindings: { routes: { '/': entry() } },
    config: cfg,
    changedFiles: ['apps/web/app/(home)/page.tsx', 's.png'],
  };
  const stale = classifyRoutes({
    ...base,
    stillChangedAt: { 's.png': '2026-11-07T13:00:00Z' },
  });
  assert.match(
    stale.failures[0].message,
    /approved\.at .* older than the still change/
  );
  const fresh = classifyRoutes({
    ...base,
    stillChangedAt: { 's.png': '2026-11-07T11:00:00Z' },
  });
  assert.equal(fresh.failures.length, 0);
  assert.equal(fresh.toCheck.length, 1);
});

test('identical section passes; recolored/shifted layout fails SSIM; stretched fails box', () => {
  const still = card(100, 60, 10);
  const ok = compareSection(
    { still, render: card(100, 60, 10), box: { width: 100, height: 60 } },
    T
  );
  assert.equal(ok.pass, true);
  assert.ok(ok.ssim > 0.99);
  const moved = compareSection(
    { still, render: card(100, 60, 60), box: { width: 100, height: 60 } },
    T
  );
  assert.equal(moved.ssimPass, false);
  assert.equal(moved.pass, false);
  const tall = compareSection(
    { still, render: card(100, 60, 10), box: { width: 100, height: 140 } },
    T
  );
  assert.equal(tall.boxPass, false);
  assert.equal(tall.pass, false);
  assert.ok(ok.diff.width === 100);
});

test('png encoding used for diff artifacts roundtrips size', () => {
  assert.ok(encodePng(solidImage(2, 2, [0, 0, 0, 255])).length > 8);
});

import { protectedBaselineReason } from './pen-diff-lib.mjs';

test('adoption guard protects Pen stills and bound-route baselines only', () => {
  const bindings = {
    routes: { '/': entry(), '/pricing': { ...pricing } },
  };
  const config = {
    baselinePrefixes: { '/': ['homepage'], '/pricing': ['pricing'] },
  };
  assert.match(
    protectedBaselineReason(
      'docs/pen-stills/home/1440/hero.png',
      bindings,
      config
    ),
    /Pen stills/
  );
  assert.match(
    protectedBaselineReason(
      'apps/web/tests/e2e/__snapshots__/x/homepage-375.png',
      bindings,
      config
    ),
    /has Pen stills/
  );
  assert.equal(
    protectedBaselineReason(
      'apps/web/tests/e2e/__snapshots__/x/pricing-375.png',
      bindings,
      config
    ),
    null
  );
  assert.equal(
    protectedBaselineReason(
      'apps/web/tests/e2e/__snapshots__/x/other.png',
      bindings,
      config
    ),
    null
  );
});
