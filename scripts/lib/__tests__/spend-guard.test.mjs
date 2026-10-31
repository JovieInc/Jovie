import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cluster,
  diffSignatures,
  normalizeMessage,
  parseLogLines,
  remediationItems,
  routeSpikes,
  signatureOf,
} from '../log-signatures.mjs';
import {
  assertSafeActions,
  buildAnomalies,
  dailySeries,
  evaluate,
  isSpike,
  oneLiner,
  planRemediations,
  project,
  projectAnomalies,
  serviceCost,
  thresholdsCrossed,
} from '../spend-guard.mjs';

const usage = {
  breakdown: {
    data: [
      {
        periodKey: '2026-10-27',
        services: [
          { name: 'Pro', category: 'subscription', cost: 0.65 },
          { name: 'Blob Advanced Operations', cost: 0.59, category: 'usage' },
        ],
      },
      {
        periodKey: '2026-10-28',
        services: [
          { name: 'Blob Advanced Operations', cost: 1.2, category: 'usage' },
          { name: 'Fluid Active CPU', cost: 0.8, category: 'usage' },
        ],
      },
    ],
  },
};

test('series ignores the Pro seat and accepts both CLI cost keys', () => {
  assert.deepEqual(
    dailySeries(usage).map(d => d.usd),
    [0.59, 2]
  );
  assert.equal(serviceCost({ effectiveCost: 3 }), 3);
  assert.equal(serviceCost({ name: 'Pro', cost: 20 }), 0);
});
test('thresholds alert at 50/75/90', () => {
  assert.deepEqual(thresholdsCrossed(20, 100), []);
  assert.deepEqual(thresholdsCrossed(76, 100), [50, 75]);
  assert.deepEqual(thresholdsCrossed(95, 100), [50, 75, 90]);
});
test('projection finds the pause date from the trailing rate', () => {
  const series = Array.from({ length: 7 }, (_, i) => ({
    day: `2026-10-${20 + i}`,
    usd: 5,
  }));
  const p = project({
    series,
    spentUsd: 80,
    budgetUsd: 100,
    periodEnd: '2026-11-14',
    now: new Date('2026-10-28T00:00:00Z'),
  });
  assert.equal(p.ratePerDayUsd, 5);
  assert.equal(p.projectedPauseDate, '2026-11-01');
  const calm = project({
    series: series.map(d => ({ ...d, usd: 0.5 })),
    spentUsd: 20,
    budgetUsd: 100,
    periodEnd: '2026-11-14',
    now: new Date('2026-10-28T00:00:00Z'),
  });
  assert.equal(calm.projectedPauseDate, null);
});
test('3x spike rule with an absolute floor', () => {
  assert.equal(isSpike({ current: 4, baseline: 1 }), true);
  assert.equal(isSpike({ current: 0.1, baseline: 0.01 }), false);
  const a = projectAnomalies({
    todayTotals: { web: 3, docs: 0.01 },
    baselineTotals: { web: 7, docs: 0.07 },
    hoursElapsed: 12,
  });
  assert.deepEqual(
    a.map(x => x.project),
    ['web']
  );
  const b = buildAnomalies({ docs: [1, 0, 1, 1, 0, 22], web: [3, 3, 4, 3] });
  assert.deepEqual(
    b.map(x => x.project),
    ['docs']
  );
});
test('remediation: fixes a missing ignored build, never raises a budget', () => {
  const projects = [
    { id: 'p1', name: 'jovie-docs', ignoreCommand: null, active: true },
    { id: 'p2', name: 'lyb', ignoreCommand: null, active: true },
  ];
  const actions = planRemediations({
    projects,
    policy: {
      'jovie-docs': { ignoreCommand: 'git diff --quiet HEAD^ HEAD -- .' },
    },
    watch: ['jovie-docs', 'lyb'],
    level: 75,
  });
  assert.equal(
    actions.find(a => a.action === 'set-ignored-build').autoApply,
    true
  );
  assert.ok(
    actions.some(
      a => a.action === 'report-missing-ignored-build' && a.project === 'lyb'
    )
  );
  assert.throws(
    () => assertSafeActions([{ action: 'raise-budget', reversible: true }]),
    /unsafe/
  );
  assert.throws(
    () => assertSafeActions([{ action: 'x', reversible: false }]),
    /unsafe/
  );
});
test('evaluate alerts on threshold, near-pause or anomaly and builds the one-liner', () => {
  const series = Array.from({ length: 7 }, (_, i) => ({
    day: `2026-10-${20 + i}`,
    usd: 4,
  }));
  const r = evaluate({
    budgetUsd: 100,
    spentUsd: 76,
    series,
    periodEnd: '2026-11-14',
    now: new Date('2026-10-28T00:00:00Z'),
  });
  assert.equal(r.alert, true);
  assert.equal(r.level, 75);
  assert.equal(
    evaluate({
      budgetUsd: 100,
      spentUsd: 10,
      series: series.map(d => ({ ...d, usd: 0.2 })),
      periodEnd: '2026-11-14',
      now: new Date('2026-10-28T00:00:00Z'),
    }).alert,
    false
  );
  const line = oneLiner({
    percent: 76,
    spentUsd: 76,
    budgetUsd: 100,
    projectedPauseDate: '2026-11-03',
    driver: 'jovie-eve-shadow (Blob)',
    autoFixed: ['ignored-build:jovie-docs'],
    decision: 'raise budget or accept pause',
  });
  assert.match(
    line,
    /^Vercel 76% \(\$76\/\$100\) \| pause ~2026-11-03 \| driver: jovie-eve-shadow/
  );
});
test('log signatures: normalize, cluster, new vs rising, route spikes', () => {
  assert.equal(
    normalizeMessage('fail 123 for dpl_abc123 at 2026-10-29T10:00:00Z'),
    'fail <n> for <id> at <ts>'
  );
  const lines = [1, 2, 3]
    .map(i =>
      JSON.stringify({
        type: 'log',
        data: {
          level: 'error',
          requestPath: `/api/x/${i}`,
          message: `boom ${i}`,
          timestamp: `2026-10-29T0${i}:00:00Z`,
        },
      })
    )
    .concat('{"type":"summary"}', 'garbage');
  const recs = parseLogLines(lines.join('\n'));
  assert.equal(recs.length, 3);
  const c = cluster(recs);
  assert.equal(c.length, 1);
  assert.equal(c[0].count, 3);
  assert.equal(diffSignatures(c, {}).fresh.length, 1);
  assert.equal(
    diffSignatures(c, { [c[0].signature]: 1 }, { floor: 3 }).rising.length,
    1
  );
  assert.equal(diffSignatures(c, { [c[0].signature]: 3 }).rising.length, 0);
  assert.deepEqual(
    routeSpikes({ '/a': 30, '/b': 2 }, { '/a': 3 }).map(s => s.route),
    ['/a']
  );
  assert.equal(
    remediationItems({ fresh: c, rising: [], project: 'jovie' })[0].kind,
    'new'
  );
  assert.equal(signatureOf(recs[0]), signatureOf(recs[1]));
});
