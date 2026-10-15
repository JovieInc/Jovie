import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
  CENSUS_PATH,
  checkCensus,
  discoverPages,
  expandCensus,
  summarizeCensus,
  validateCensus,
} from '../../design-surface-census.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = Date.parse('2026-10-22T04:36:00Z');
const start = '2026-10-15T04:36:00Z';
function fixture() {
  return {
    schema: 'jovie.design-surface-census/v1',
    startedAt: start,
    groups: [
      {
        id: 'pricing',
        area: 'marketing',
        owner: '@itstimwhite',
        issue: 'JOV-8097',
        importance: { acquisition: 3, revenue: 3, usage: 3 },
        status: 'holdout',
        expectedOwners: ['apps/web/components/site/PublicPageShell.tsx'],
        remainingScope: 'Certify pricing',
        divergence: 'Minimal footer',
        evidence: { kind: 'source-audit', at: start, ref: 'before' },
        sources: ['apps/web/app/(marketing)/pricing/page.tsx'],
      },
    ],
    excluded: { reason: 'Internal fixtures', sources: [] },
    transitions: [],
  };
}
const pageSources = census => expandCensus(census).map(row => row.source);
function complete(census, at = '2026-10-21T04:36:00Z') {
  for (const group of census.groups) {
    group.status = 'canonical';
    group.evidence = { kind: 'certification', at, ref: 'exact-build-render' };
    for (const source of group.sources)
      census.transitions.push({
        source,
        from: 'holdout',
        to: 'canonical',
        at,
        evidence: 'exact-build-render',
      });
  }
  return census;
}

test('the checked-in census covers the real page tree, including explicit fixtures', () => {
  const census = JSON.parse(
    readFileSync(new URL(CENSUS_PATH, `file://${root}`), 'utf8')
  );
  const rows = validateCensus(census, discoverPages(root));
  assert.deepEqual(checkCensus(root, 'HEAD').rows, rows);
  assert.ok(rows.length > 150);
  assert.equal(rows.find(row => row.id === 'pricing').route, '/pricing');
});

test('new pages, duplicate registrations and hidden existing surfaces fail closed', () => {
  const census = fixture();
  assert.throws(
    () =>
      validateCensus(
        census,
        [...pageSources(census), 'apps/web/app/new/page.tsx'],
        null,
        now
      ),
    /every page/
  );
  const duplicate = structuredClone(census);
  duplicate.excluded.sources = pageSources(census);
  assert.throws(
    () => validateCensus(duplicate, pageSources(census), null, now),
    /production pages/
  );
  const hidden = structuredClone(census);
  hidden.excluded.sources = pageSources(census);
  hidden.groups = [];
  assert.throws(
    () => validateCensus(hidden, pageSources(census), census, now),
    /production pages/
  );
});

test('every surface needs an accountable issue, owners, evidence and valid importance', () => {
  for (const field of ['issue', 'owner', 'remainingScope', 'divergence']) {
    const census = fixture();
    census.groups[0][field] = '';
    assert.throws(() => validateCensus(census, pageSources(census), null, now));
  }
  const census = fixture();
  census.groups[0].importance.revenue = 0;
  assert.throws(
    () => validateCensus(census, pageSources(census), null, now),
    /importance/
  );
  census.groups[0].importance.revenue = 3;
  census.groups[0].status = 'canonical';
  assert.throws(
    () => validateCensus(census, pageSources(census), null, now),
    /not certification/
  );
});

test('the ratchet rejects regression, weight dilution and rewritten history', () => {
  const old = complete(fixture());
  const current = structuredClone(old);
  current.groups[0].status = 'migrating';
  current.transitions.push({
    source: pageSources(old)[0],
    from: 'canonical',
    to: 'migrating',
    at: new Date(now).toISOString(),
    evidence: 'regression',
  });
  assert.throws(
    () => validateCensus(current, pageSources(current), old, now),
    /canonical regression/
  );
  const diluted = structuredClone(old);
  diluted.groups[0].importance.revenue = 1;
  assert.throws(
    () => validateCensus(diluted, pageSources(diluted), old, now),
    /baseline work weights/
  );
  const rewritten = structuredClone(old);
  rewritten.transitions[0].evidence = 'rewritten';
  assert.throws(
    () => validateCensus(rewritten, pageSources(rewritten), old, now),
    /append-only/
  );
  const migrating = fixture();
  migrating.groups[0].status = 'migrating';
  assert.throws(
    () => validateCensus(fixture(), pageSources(migrating), migrating, now),
    /new holdout/
  );
});

test('promotions require observed transitions; exception approval expires', () => {
  const old = fixture();
  const current = complete(fixture());
  assert.equal(
    validateCensus(current, pageSources(current), old, now).length,
    1
  );
  current.transitions = [];
  assert.throws(
    () => validateCensus(current, pageSources(current), old, now),
    /transition evidence/
  );
  const exception = fixture();
  exception.groups[0].status = 'intentional_exception';
  assert.throws(
    () => validateCensus(exception, pageSources(exception), null, now),
    /exception/
  );
  exception.groups[0].exception = {
    approvedBy: 'Tim',
    reason: 'Scoped identity treatment',
    reviewAt: '2026-10-23T00:00:00Z',
  };
  validateCensus(exception, pageSources(exception), null, now);
  exception.groups[0].exception.reviewAt = start;
  assert.throws(
    () => validateCensus(exception, pageSources(exception), null, now),
    /expired/
  );
});

test('genuinely new holdouts are allowed, declared and counted', () => {
  const old = fixture();
  const current = fixture();
  const source = 'apps/web/app/new/page.tsx';
  current.groups[0].sources.push(source);
  assert.throws(
    () => validateCensus(current, pageSources(current), old, now),
    /introduction event/
  );
  current.transitions.push({
    source,
    from: null,
    to: 'holdout',
    at: new Date(now - 1000).toISOString(),
    evidence: 'New screen declaration',
  });
  validateCensus(current, pageSources(current), old, now);
  assert.equal(summarizeCensus(current, now).rolling24h.introducedHoldouts, 1);
});

test('rolling windows exclude their boundary and ETA waits for real throughput', () => {
  const census = complete(fixture());
  assert.equal(summarizeCensus(census, now).rolling24h.canonicalized, 0);
  assert.equal(summarizeCensus(census, now).rolling7d.canonicalized, 1);
  assert.match(summarizeCensus(census, now).eta.reason, /Insufficient/);
  assert.throws(
    () => validateCensus(census, pageSources(census), null, Date.parse(start)),
    /observed|evidence/
  );
  census.groups[0].sources.push(
    'apps/web/app/b/page.tsx',
    'apps/web/app/c/page.tsx'
  );
  census.transitions = [];
  complete(census);
  const remaining = structuredClone(fixture().groups[0]);
  remaining.id = 'remaining';
  remaining.sources = ['apps/web/app/remaining/page.tsx'];
  census.groups.push(remaining);
  const summary = summarizeCensus(census, now);
  assert.equal(summary.total, 4);
  assert.equal(summary.canonicalPercent, 75);
  assert.equal(summary.remainingWeight, 9);
  assert.equal(summary.rolling7d.completedWeight, 27);
  assert.equal(summary.eta.days, 7 / 3);
  assert.deepEqual(summary.eta.rangeDays, [14 / 9, 14 / 3]);
});
