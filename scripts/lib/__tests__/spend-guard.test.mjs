import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  projectTotals,
  serviceCost,
  thresholdsCrossed,
  totalCost,
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

test('unavailable and malformed costs never become zero usage', () => {
  for (const cost of [
    undefined,
    null,
    '',
    ' ',
    'unavailable',
    NaN,
    Infinity,
    false,
  ])
    assert.throws(
      () => serviceCost({ name: 'CDN Requests', cost }),
      /invalid cost/
    );
  assert.equal(serviceCost({ cost: '0' }), 0);
  assert.equal(serviceCost({ cost: '-1.5' }), -1.5);
  assert.equal(totalCost([]), 0);
  assert.deepEqual(projectTotals({ groupBy: { data: [] } }), {});
  assert.throws(() => totalCost(undefined), /unavailable/);
  assert.throws(() => dailySeries({}), /unavailable/);
  assert.throws(() => projectTotals({}), /unavailable/);
  assert.throws(
    () =>
      dailySeries({
        breakdown: {
          data: [
            { periodKey: '2026-11-12', services: [{ cost: 'unavailable' }] },
          ],
        },
      }),
    /invalid cost/
  );
});

test('an expired or invalid billing cycle cannot produce a healthy projection', () => {
  for (const periodEnd of ['2026-11-14', 'invalid'])
    assert.throws(
      () =>
        project({
          series: [],
          spentUsd: 80,
          budgetUsd: 100,
          periodEnd,
          now: new Date('2026-11-15T12:00:00Z'),
        }),
      /billing period/
    );
});

const workflow = readFileSync(
  new URL('../../../.github/workflows/spend-guard.yml', import.meta.url),
  'utf8'
);
function stepSource(name) {
  const section = workflow
    .split(`      - name: ${name}\n`)[1]
    ?.split('\n      - name:')[0];
  assert.ok(section, `missing workflow step ${name}`);
  return section;
}
function runStep(name, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spend-guard-test-'));
  try {
    mkdirSync(join(dir, 'bin'));
    // Execute the real workflow shell. Only its external provider and Slack
    // transports are fixtures; no production request or real webhook is used.
    writeFileSync(
      join(dir, 'bin/node'),
      '#!/bin/bash\n[ "$FIXTURE_READ" != error ] || exit 42\nprintf "%s" "$FIXTURE_REPORT"\n',
      { mode: 0o755 }
    );
    writeFileSync(
      join(dir, 'bin/curl'),
      '#!/bin/bash\nset -eu\nfail=false\nout=""\nwhile [ "$#" -gt 0 ]; do\ncase "$1" in --fail) fail=true;; --output) shift; out="$1";; esac\nshift\ndone\n[ "$fail" = true ] || exit 91\n[ "$FIXTURE_HTTP" != error ] || exit 22\nprintf "%s" "$FIXTURE_BODY" > "$out"\n',
      { mode: 0o755 }
    );
    const script = stepSource(name)
      .split('        run: |\n')[1]
      .split('\n')
      .map(line => line.replace(/^          /, ''))
      .join('\n');
    const output = join(dir, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', script], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        VERCEL_TOKEN: 'fixture-only',
        SLACK_WEBHOOK_URL: 'https://invalid.example/fixture',
        MESSAGE: 'fixture alert',
        FIXTURE_REPORT: '{"alert":false,"message":"healthy fixture"}',
        FIXTURE_BODY: 'ok',
        FIXTURE_HTTP: 'ok',
        ...env,
      },
    });
    return {
      ...result,
      output: readFileSync(output, 'utf8'),
      report: (() => {
        try {
          return JSON.parse(
            readFileSync(join(dir, 'spend-report.json'), 'utf8')
          );
        } catch {
          return null;
        }
      })(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('missing token, failed provider and malformed report produce a red actionable alert', () => {
  for (const env of [
    { VERCEL_TOKEN: '' },
    { FIXTURE_READ: 'error' },
    { FIXTURE_REPORT: '{"alert":"false"}' },
  ]) {
    const r = runStep('Evaluate spend', env);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.output, /read_status=unavailable/);
    assert.match(r.output, /alert=true/);
    assert.equal(r.report.spentUsd, null);
    assert.equal(r.report.readStatus, 'unavailable');
    assert.match(r.report.message, /unknown/);
  }
  const healthy = runStep('Evaluate spend');
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.match(healthy.output, /read_status=success/);
  assert.match(healthy.output, /alert=false/);
});

test('Slack requires an available webhook, successful HTTP and the acceptance body', () => {
  for (const env of [
    { SLACK_WEBHOOK_URL: '' },
    { FIXTURE_HTTP: 'error' },
    { FIXTURE_BODY: 'invalid_payload' },
  ]) {
    const r = runStep('Notify Slack on a spend alert', env);
    assert.notEqual(r.status, 0);
    assert.match(r.output, /delivery_status=failed/);
    assert.doesNotMatch(r.output, /delivery_status=accepted/);
  }
  const accepted = runStep('Notify Slack on a spend alert');
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.output, /delivery_status=accepted/);
});

test('protection failures still reach existing notification and remediation steps', () => {
  assert.match(
    stepSource('Notify Slack on a spend alert'),
    /if: \$\{\{ !cancelled\(\) && steps.spend.outputs.alert == 'true' \}\}/
  );
  assert.match(
    stepSource('File or resolve spend remediation'),
    /if: \$\{\{ !cancelled\(\) && steps.spend.outputs.alert != '' \}\}/
  );
});

test('a failed current-day project read cannot produce a successful CLI report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spend-provider-test-'));
  try {
    const provider = join(dir, 'vercel-fixture');
    writeFileSync(
      provider,
      `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (args[0] === 'budgets') console.log(JSON.stringify({budgets:[{scope:'team',amount:100}]}));\nelse if (args.includes('--breakdown')) console.log(JSON.stringify({breakdown:{data:[{periodKey:'2026-11-11',services:[{cost:1}]}]}}));\nelse if (args.includes('--group-by')) {\nif (args.includes('2026-11-12')) process.exit(42);\nconsole.log(JSON.stringify({groupBy:{data:[]}}));\n} else console.log(JSON.stringify({services:[{cost:1}],projects:[],deployments:[]}));\n`,
      { mode: 0o755 }
    );
    const result = spawnSync(
      process.execPath,
      [
        new URL('../../spend-guard.mjs', import.meta.url).pathname,
        '--now',
        '2026-11-12T20:00:00Z',
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          VERCEL_BIN: provider,
          VERCEL_TOKEN: 'fixture-only',
        },
      }
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
