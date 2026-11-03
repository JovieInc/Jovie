import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import {
  clusters,
  dueMeasurements,
  holds,
  metricDelta,
  notifyLine,
  parseWinSection,
  readLedger,
  requiredWinErrors,
  requiresWin,
  validateLedger,
  validateWin,
  weeklyMetrics,
  weeklyRollup,
  winFromPr,
  winSectionErrors,
  winStatus,
} from '../wins-ledger.mjs';

const base = () => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-29-x',
  date: '2026-10-29',
  area: 'queue',
  theme: 't',
  claim: 'Faster gate',
  prs: [{ repo: 'a/b', number: 1, mergedAt: '2026-10-29T00:00:00Z' }],
  metrics: [
    {
      name: 'wait',
      unit: 's',
      better: 'lower',
      before: 100,
      after: 10,
      source: 'gh',
      query: 'q',
    },
  ],
  verifyLink: 'https://example.com',
  receipts: [],
});

test('the committed ledger is valid and ids are unique', () => {
  assert.deepEqual(validateLedger(readLedger()), []);
});

test('status: claimed until a post-merge receipt keeps the gain', () => {
  const w = base();
  assert.equal(winStatus(w), 'claimed');
  w.receipts = [
    { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
  ];
  assert.equal(winStatus(w), 'verified');
  w.receipts[0].value = 90;
  assert.equal(winStatus(w), 'not-reproduced');
  w.receipts[0].at = '2026-10-28T00:00:00Z'; // before merge: ignored
  assert.equal(winStatus(w), 'claimed');
});

test('status: open PR is pending-merge, no numbers is unverified', () => {
  const w = base();
  w.prs[0].mergedAt = null;
  assert.equal(winStatus(w), 'pending-merge');
  const n = base();
  n.metrics = [];
  assert.equal(winStatus(n), 'unverified');
});

test('holds: unclaimed after needs 20% gain', () => {
  const m = { before: 141, after: null, better: 'lower' };
  assert.equal(holds(m, 116.5), false);
  assert.equal(holds(m, 100), true);
});

test('validation rejects missing source, bad area and empty prs', () => {
  const w = base();
  w.area = 'nope';
  w.prs = [];
  w.metrics[0].source = '';
  const p = validateWin(w);
  assert.ok(p.some(x => x.startsWith('area')));
  assert.ok(p.some(x => x.startsWith('prs')));
  assert.ok(p.some(x => x.includes('source')));
});

const body = `## Win
- Claim: Gate jobs start 10x sooner
- Area: queue
- Theme: merge-throughput
- Metric: gate wait p50 | s | lower | 141 | 3 | gh jobs api | gh api actions/runs/ID/jobs
- Verify: https://github.com/JovieInc/Jovie/pull/1

## Other`;

test('PR Win section parses into a ledger record', () => {
  const win = winFromPr(
    { repo: 'JovieInc/Jovie', number: 9, mergedAt: '2026-10-29T10:00:00Z' },
    parseWinSection(body)
  );
  assert.equal(win.id, 'win-2026-10-29-gate-jobs-start-10x-sooner');
  assert.equal(win.metrics[0].before, 141);
  assert.deepEqual(validateWin(win), []);
  assert.deepEqual(winSectionErrors(body), []);
});

test('n/a declines; malformed section errors; absent is silent', () => {
  assert.equal(parseWinSection('## Win\nn/a\n').declined, true);
  assert.deepEqual(winSectionErrors('## Summary\nx'), []);
  assert.ok(winSectionErrors('## Win\n- Claim: only a claim\n').length > 0);
});

// Data is not shipped as PRs: the workflow writes the Win to the runtime store
// and never opens a ledger PR or commits to git.
test('workflow records wins in the store and never opens a ledger PR', () => {
  const text = readFileSync(
    join(
      resolve(import.meta.dirname, '../../..'),
      '.github/workflows/wins-ledger.yml'
    ),
    'utf8'
  );
  const steps = /** @type {any} */ (load(text)).jobs.ingest.steps
    .map(s => s.run ?? '')
    .join('\n');
  assert.match(steps, /wins-ledger\.mjs ingest --pr "\$PR_NUMBER" --store/);
  assert.doesNotMatch(steps, /git (commit|push)|pr create/);
});

test('clusters trigger at ten verified wins only', () => {
  const wins = Array.from({ length: 10 }, (_, i) => {
    const w = base();
    w.id = `win-2026-10-29-w${i}`;
    w.receipts = [
      { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
    ];
    return w;
  });
  assert.equal(clusters(wins)[0].ready, true);
  assert.equal(clusters(wins.slice(1))[0].ready, false);
  assert.equal(weeklyMetrics(wins).winsVerified, 10);
});

const merged = '2026-10-20T00:00:00Z';
const sample = (over = {}) => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-20-sample',
  date: '2026-10-20',
  area: 'ci',
  theme: 'merge-throughput',
  claim: 'Sample',
  prs: [{ repo: 'a/b', number: 1, mergedAt: merged }],
  metrics: [
    {
      name: 'wait',
      unit: 's',
      better: 'lower',
      before: 120,
      after: 3,
      perMerge: true,
      source: 'x run',
      query: 'q query',
    },
  ],
  verifyLink: 'https://example.com/run',
  receipts: [],
  ...over,
});

test('compounding label and ci/perf titles require a win; others do not', () => {
  assert.equal(
    requiresWin({ title: 'feat(x): y', labels: ['compounding'] }),
    true
  );
  assert.equal(
    requiresWin({ title: 'ci(queue): run on hosted', labels: [] }),
    true
  );
  assert.equal(requiresWin({ title: 'perf: faster', labels: [] }), true);
  assert.equal(requiresWin({ title: 'fix(billing): copy', labels: [] }), false);
});

test('a required win prints the paste-ready template; n/a does not satisfy it', () => {
  const errs = requiredWinErrors({
    title: 'ci: x',
    labels: [],
    body: '## Win\n\nn/a',
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /- Metric: <name>/);
  assert.deepEqual(
    requiredWinErrors({
      title: 'ci: x',
      labels: [],
      body: '## Win\n- Claim: Faster\n- Area: ci\n- Theme: merge-throughput\n- Metric: wait | s | lower | 120 | 3 | run | q\n- Verify: https://example.com/r',
    }),
    []
  );
});

test('an empty after-value needs Pending: yes and becomes pending-measure', () => {
  const body = pending =>
    `## Win\n- Claim: Faster\n- Area: ci\n- Theme: merge-throughput\n- Metric: wait | s | lower | 120 | ? | run | q query\n- Verify: https://example.com/r${pending ? '\n- Pending: yes' : ''}`;
  assert.ok(winSectionErrors(body(false)).some(e => /Pending: yes/.test(e)));
  assert.deepEqual(winSectionErrors(body(true)), []);
  const win = sample({
    pendingAfter: true,
    metrics: [{ ...sample().metrics[0], after: null }],
  });
  assert.equal(winStatus(win), 'pending-measure');
  assert.equal(
    dueMeasurements([win], Date.parse(merged) + 25 * 3_600_000).length,
    1
  );
  assert.equal(
    dueMeasurements([win], Date.parse(merged) + 3_600_000).length,
    0
  );
});

test('delta, notification and weekly rollup', () => {
  assert.deepEqual(metricDelta(sample().metrics[0]), {
    delta: -117,
    gain: 117,
    gainPct: 97.5,
  });
  assert.equal(notifyLine(sample()), null, 'claimed wins never message');
  const verified = sample({
    receipts: [
      {
        metric: 'wait',
        value: 5,
        at: '2026-10-21T00:00:00Z',
        evidence: 'https://example.com/run/2',
      },
    ],
  });
  assert.match(notifyLine(verified), /^Win \(verified\):/);
  const [row] = weeklyRollup(
    [verified],
    [
      { createdAt: '2026-10-19T00:00:00Z', mergedAt: '2026-10-20T00:00:00Z' },
      { createdAt: '2026-10-20T00:00:00Z', mergedAt: '2026-10-20T06:00:00Z' },
    ]
  );
  assert.equal(row.week, '2026-10-19');
  assert.equal(row.verified, 1);
  assert.equal(row.secondsSavedPerMergeVerified, 117);
  assert.equal(row.mergedPrs, 2);
  assert.equal(row.leadTimeHoursP50, 6);
});
