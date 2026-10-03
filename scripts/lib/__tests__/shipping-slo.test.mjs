import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { collectRaw } from '../../shipping-slo-report.mjs';

vi.mock('node:child_process', async importOriginal => {
  /** @type {typeof import('node:child_process')} */
  const actual = await importOriginal();
  return {
    ...actual,
    execFileSync: (_file, args) => {
      if (!args[1]?.includes('/actions/workflows/')) return '[]';
      return actual.execFileSync('jq', ['-c', args.at(-1)], {
        encoding: 'utf8',
        input: JSON.stringify({
          workflow_runs: [
            { id: 7, pull_requests: null },
            { id: 8, pull_requests: [{ number: 42 }] },
          ],
        }),
      });
    },
  };
});

it('retains a workflow batch containing null PR associations through the real jq filter', () => {
  const raw = collectRaw({ workflows: ['ci.yml'], days: 1 });
  for (const runs of Object.values(raw.runs)) {
    expect(runs.map(run => [run.id, run.prNumbers])).toEqual([
      [7, []],
      [8, [42]],
    ]);
  }
});

import {
  buildGistSloBlock,
  capacityUtilization,
  ciWalltimeByEvent,
  DEFAULT_THRESHOLDS,
  evaluateShippingSlo,
  leadTimeByLane,
  METRIC_DEFS,
  mergeQueueStats,
  prLane,
  productionLag,
  ratchetBaseline,
  remediationStats,
  throughputTrend,
  validateBaseline,
} from '../shipping-slo.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/shipping-slo.yml'),
  'utf8'
);
const NOW = Date.parse('2026-09-28T00:00:00Z');
const DAY = 86_400_000;
const ago = days => new Date(NOW - days * DAY).toISOString();

const run = (createdAt, updatedAt, opts = {}) => ({
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  head_branch: 'devin/x',
  created_at: createdAt,
  updated_at: updatedAt,
  ...opts,
});

const baseline = metrics => ({
  schemaVersion: 1,
  thresholds: { ...DEFAULT_THRESHOLDS },
  metrics,
  history: [],
});

const seedBaseline = () =>
  baseline(
    Object.fromEntries(
      METRIC_DEFS.map(d => [
        d.key,
        { value: 100, unit: d.unit, direction: d.direction },
      ])
    )
  );

describe('shipping SLO workflow credentials', () => {
  it('does not persist the read-only checkout credential before app-token git writes', () => {
    expect(WORKFLOW).toMatch(
      /- name: Checkout\s+uses: actions\/checkout@[^\n]+\s+with:\s+persist-credentials: false/
    );
    expect(WORKFLOW).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(WORKFLOW).toContain(
      'git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git"'
    );
    expect(WORKFLOW).toContain('docs/metrics/blog-publish-latency-latest.json');
  });

  it('publishes generated snapshots through a pull request instead of protected main', () => {
    expect(WORKFLOW).toContain(
      'BRANCH="bot/shipping-slo-snapshot-${{ github.run_id }}-${{ github.run_attempt }}"'
    );
    expect(WORKFLOW).toContain('git push -u origin "$BRANCH"');
    expect(WORKFLOW).toContain(
      'gh pr create --repo "${{ github.repository }}" --base main --head "$BRANCH"'
    );
    expect(WORKFLOW).not.toContain('git push origin HEAD:main');
  });
});

describe('ciWalltimeByEvent', () => {
  it('computes per-event p95 from successful completed runs in the window', () => {
    const runs = [
      run(ago(1), new Date(NOW - DAY + 600_000).toISOString()), // 600s PR
      run(ago(1), new Date(NOW - DAY + 300_000).toISOString(), {
        event: 'merge_group',
      }),
      run(ago(1), new Date(NOW - DAY + 100_000).toISOString(), {
        conclusion: 'failure',
      }), // excluded: not a gate-success duration
      run(ago(30), new Date(NOW - 30 * DAY + 600_000).toISOString()), // outside window
    ];
    const out = ciWalltimeByEvent(runs, NOW - 7 * DAY, NOW);
    expect(out.pull_request.p95).toBe(600);
    expect(out.pull_request.n).toBe(1);
    expect(out.merge_group.p95).toBe(300);
  });
});

describe('mergeQueueStats', () => {
  it('measures wait from last enqueue to merge and counts ejections', () => {
    const timelines = [
      [
        { type: 'added_to_merge_queue', at: ago(1) },
        { type: 'merged', at: new Date(NOW - DAY + 900_000).toISOString() },
      ],
      [
        { type: 'added_to_merge_queue', at: ago(2) },
        {
          type: 'removed_from_merge_queue',
          at: new Date(NOW - 2 * DAY + 60_000).toISOString(),
        },
        {
          type: 'added_to_merge_queue',
          at: new Date(NOW - 2 * DAY + 120_000).toISOString(),
        },
        { type: 'merged', at: new Date(NOW - 2 * DAY + 720_000).toISOString() },
      ],
    ];
    const s = mergeQueueStats(timelines, NOW - 7 * DAY, NOW);
    expect(s.enqueued).toBe(3);
    expect(s.ejected).toBe(1);
    expect(s.ejectionRate).toBeCloseTo(1 / 3);
    expect(s.wait.n).toBe(2);
    expect(s.wait.p95).toBe(900);
  });
});

describe('prLane + leadTimeByLane', () => {
  it('groups lead time by branch prefix lane', () => {
    expect(prLane({ headRefName: 'devin/jov-1-x' })).toBe('devin');
    expect(prLane({ headRefName: 'codex/thing' })).toBe('codex');
    expect(prLane({ headRefName: 'tim/feature' })).toBe('other');
    const prs = [
      { headRefName: 'devin/a', createdAt: ago(2), mergedAt: ago(1) },
      { headRefName: 'codex/b', createdAt: ago(3), mergedAt: ago(1) },
    ];
    const out = leadTimeByLane(prs, NOW - 7 * DAY, NOW);
    expect(out.devin.p95).toBe(DAY / 1000);
    expect(out.codex.p95).toBe((2 * DAY) / 1000);
    expect(out.other).toBeUndefined();
  });
});

describe('remediationStats', () => {
  it('measures PR and main red→green deltas', () => {
    const t0 = ago(1);
    const prRuns = [
      run(t0, t0, { head_branch: 'devin/a', conclusion: 'failure' }),
      run(
        new Date(Date.parse(t0) + 1800_000).toISOString(),
        new Date(Date.parse(t0) + 2400_000).toISOString(),
        { head_branch: 'devin/a', conclusion: 'success' }
      ),
    ];
    const mainRuns = [
      run(t0, t0, { conclusion: 'failure' }),
      run(
        new Date(Date.parse(t0) + 600_000).toISOString(),
        new Date(Date.parse(t0) + 900_000).toISOString(),
        { conclusion: 'success' }
      ),
    ];
    const s = remediationStats({
      prRuns,
      mainRuns,
      promoteHolds: [
        {
          startedAt: t0,
          clearedAt: new Date(Date.parse(t0) + 300_000).toISOString(),
        },
      ],
      sinceMs: NOW - 7 * DAY,
      nowMs: NOW,
    });
    expect(s.prRedToGreen.p95).toBe(2400);
    expect(s.mainRedToGreen.p95).toBe(900);
    expect(s.promoteHold.p95).toBe(300);
  });

  it('reports null promote-hold percentiles with no data source', () => {
    const s = remediationStats({
      prRuns: [],
      mainRuns: [],
      promoteHolds: [],
      sinceMs: 0,
      nowMs: NOW,
    });
    expect(s.promoteHold.p95).toBeNull();
  });
});

describe('productionLag', () => {
  it('matches merge sha to the first successful production deployment', () => {
    const prs = [
      { mergedAt: ago(1), mergeCommitSha: 'aaa' },
      { mergedAt: ago(1), mergeCommitSha: 'bbb' },
    ];
    const deployments = [
      {
        status: 'success',
        createdAt: new Date(NOW - DAY + 300_000).toISOString(),
        sha: 'aaa',
      },
    ];
    const lag = productionLag(prs, deployments, NOW - 7 * DAY, NOW);
    expect(lag.merged).toBe(2);
    expect(lag.verified).toBe(1);
    expect(lag.lag.p95).toBe(300);
  });
});

describe('throughputTrend', () => {
  const prsIn = (fromDaysAgo, toDaysAgo, n) =>
    Array.from({ length: n }, (_, i) => ({
      mergedAt: new Date(
        NOW -
          (fromDaysAgo + ((toDaysAgo - fromDaysAgo) * i) / Math.max(n - 1, 1)) *
            DAY
      ).toISOString(),
      mergeCommitSha: `s${i}`,
    }));

  it('computes merges/day, WoW growth, and second-order trend', () => {
    const prs = [
      ...prsIn(0.01, 6.9, 14), // w0: 14
      ...prsIn(7.01, 13.9, 7), // w1: 7 → growth +100%
      ...prsIn(14.01, 20.9, 7), // w2: 7 → prev growth 0% → accelerating
    ];
    const t = throughputTrend(prs, NOW);
    expect(t.mergesPerDay).toBe(2);
    expect(t.wowGrowth).toBeCloseTo(1);
    expect(t.prevWowGrowth).toBeCloseTo(0);
    expect(t.growthTrend).toBe('accelerating');
  });

  it('flags flat growth', () => {
    const prs = [
      ...prsIn(0.01, 6.9, 7),
      ...prsIn(7.01, 13.9, 7),
      ...prsIn(14.01, 20.9, 7),
    ];
    expect(throughputTrend(prs, NOW).growthTrend).toBe('flat');
  });
});

describe('capacityUtilization', () => {
  it('reports per-provider utilization and idle minutes with qualified work', () => {
    const samples = [
      { provider: 'devin', running: 2, slots: 2, qualifiedWork: 0 },
      { provider: 'devin', running: 1, slots: 2, qualifiedWork: 5 },
      { provider: 'codex', running: 0, slots: 1, qualifiedWork: 3 },
    ];
    const c = capacityUtilization(samples, {
      intervalMinutes: 10,
      verifiedCount: 30,
    });
    expect(c.providers.devin.utilization).toBeCloseTo(3 / 4);
    expect(c.idleMinutesWithQualifiedWork).toBe(20);
    expect(c.verifiedPerRunnerHour).toBeCloseTo(30 / (30 / 60));
  });
});

describe('evaluateShippingSlo', () => {
  it('flags >20% latency regression and >20% throughput drop', () => {
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat['ci_walltime.pull_request.p95'] = 121; // > 100 * 1.2
    flat['throughput.merges_per_day'] = 79; // < 100 * 0.8
    const { regressions, tightenCandidates } = evaluateShippingSlo(
      flat,
      seedBaseline()
    );
    expect(regressions.map(r => r.key).sort()).toEqual([
      'ci_walltime.pull_request.p95',
      'throughput.merges_per_day',
    ]);
    expect(tightenCandidates).toEqual([]);
  });

  it('requires the improvement to hold improvementHoldDays before tightening', () => {
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat['merge_queue.wait.p95'] = 80; // >10% below baseline 100
    let evald = evaluateShippingSlo(flat, seedBaseline());
    expect(evald.tightenCandidates).toEqual([]);

    const base = seedBaseline();
    base.history = [
      { date: '2026-09-26', values: { 'merge_queue.wait.p95': 85 } },
      { date: '2026-09-27', values: { 'merge_queue.wait.p95': 82 } },
    ];
    evald = evaluateShippingSlo(flat, base);
    expect(evald.tightenCandidates.map(c => c.key)).toEqual([
      'merge_queue.wait.p95',
    ]);
    expect(evald.tightenCandidates[0].heldDays).toBe(3);
  });

  it('resets the hold streak when a day is not improved', () => {
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat['merge_queue.wait.p95'] = 80;
    const base = seedBaseline();
    base.history = [
      { date: '2026-09-25', values: { 'merge_queue.wait.p95': 85 } },
      { date: '2026-09-26', values: { 'merge_queue.wait.p95': 120 } },
      { date: '2026-09-27', values: { 'merge_queue.wait.p95': 82 } },
    ];
    expect(evaluateShippingSlo(flat, base).tightenCandidates).toEqual([]);
  });

  it('flags a throughput growth stall without an absolute regression', () => {
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat.throughput_wow_growth = 0.03; // below +8% target
    const base = seedBaseline();
    base.history = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-09-${String(14 - i).padStart(2, '0')}`,
      values: {},
      throughput: { wowGrowth: 0.02 },
    }));
    expect(evaluateShippingSlo(flat, base).flatStall).toBe(true);
    expect(evaluateShippingSlo(flat, base).regressions).toEqual([]);
  });
});

describe('ratchetBaseline', () => {
  it('tightens held improvements, appends history, never worsens', () => {
    const base = seedBaseline();
    base.history = [
      { date: '2026-09-26', values: { 'merge_queue.wait.p95': 85 } },
      { date: '2026-09-27', values: { 'merge_queue.wait.p95': 82 } },
    ];
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat['merge_queue.wait.p95'] = 80;
    flat['throughput.merges_per_day'] = 50; // below baseline 100 → never tighten upward... wait, higher-better: 50 is worse, no tighten anyway
    const evald = evaluateShippingSlo(flat, base);
    const { next, tightened } = ratchetBaseline(base, flat, evald, {
      now: NOW,
    });
    expect(tightened).toEqual(['merge_queue.wait.p95']);
    expect(next.metrics['merge_queue.wait.p95'].value).toBe(80);
    expect(next.metrics['throughput.merges_per_day'].value).toBe(100);
    expect(next.history.at(-1).values['merge_queue.wait.p95']).toBe(80);
    expect(validateBaseline(next).ok).toBe(true);
  });
});

describe('buildGistSloBlock', () => {
  it('emits the compact slo block for the lanes status gist', () => {
    const flat = Object.fromEntries(METRIC_DEFS.map(d => [d.key, null]));
    flat['ci_walltime.pull_request.p95'] = 600;
    flat['throughput.merges_per_day'] = 25;
    flat.throughput_wow_growth = 0.12;
    flat.throughput_growth_trend = 'accelerating';
    const block = buildGistSloBlock(
      flat,
      { regressions: [], flatStall: false },
      { now: NOW }
    );
    expect(block.ciP95Seconds.pull_request).toBe(600);
    expect(block.throughput.mergesPerDay).toBe(25);
    expect(block.throughput.wowGrowth).toBe(0.12);
    expect(block.regressions).toEqual([]);
  });
});

describe('validateBaseline', () => {
  it('accepts the seeded shape and rejects unknown metrics', () => {
    expect(validateBaseline(seedBaseline()).ok).toBe(true);
    const bad = seedBaseline();
    bad.metrics['nope.bad'] = { value: 1 };
    const { ok, errors } = validateBaseline(bad);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toContain('nope.bad');
  });
});
