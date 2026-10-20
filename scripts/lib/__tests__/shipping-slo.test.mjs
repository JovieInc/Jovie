import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { deliverReport, upsertSloFinding } from '../../shipping-slo-intake.mjs';
import { buildReport, collectRaw } from '../../shipping-slo-report.mjs';
import { fakeLinear } from './fixtures/shipping-slo-fake-linear.mjs';

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
      METRIC_DEFS.filter(d => !d.unsupported).map(d => [
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
    // 'bbb' is also covered: a verified generation ships its ancestors.
    expect(lag.verified).toBe(2);
    expect(lag.lag.p95).toBe(300);
  });

  it('does not verify merges that landed after the last success', () => {
    const prs = [
      { mergedAt: ago(3), mergeCommitSha: 'aaa' },
      { mergedAt: ago(0.1), mergeCommitSha: 'bbb' },
    ];
    const deployments = [{ status: 'success', createdAt: ago(2), sha: 'aaa' }];
    const lag = productionLag(prs, deployments, NOW - 7 * DAY, NOW);
    expect(lag.merged).toBe(2);
    expect(lag.verified).toBe(1);
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

// Keep delivery regressions in the suite registered by the CI inventory.
describe('shipping SLO intake delivery', () => {
  const repo = 'JovieInc/Jovie';
  const makeState = () => ({
    owner: {
      id: 'slo-parent',
      assignee: { id: 'slo-owner' },
      team: {
        id: 'jovie-team',
        states: { nodes: [{ id: 'triage-state', type: 'triage' }] },
      },
    },
    issues: [],
    calls: [],
    failure: null,
  });
  const report = (metric = 'lead_time.devin.p95') => ({
    evaluation: {
      regressions: [
        { key: metric, baseline: 100, observed: 130, changeFraction: 0.3 },
      ],
      flatStall: false,
    },
    sampled: { ciRuns: 1, mergedPrs: 0 },
    offenders: { slowestPrs: [], slowestCiRuns: [] },
  });
  const run = (state, id = 'oct05', input = report()) =>
    deliverReport(
      input,
      { repo, runUrl: `https://github.com/${repo}/actions/runs/${id}` },
      { apiKey: 'slo-test-key', fetchImpl: fakeLinear(state) }
    );

  it('delivers to the current Linear SLO owner with no labels, appends runs once and replays safely', async () => {
    const state = makeState();
    expect(await run(state)).toMatchObject({
      status: 'succeeded',
      destination: 'linear',
      owner: 'JOV-6783',
    });
    expect((await run(state, 'oct07')).findings[0].action).toBe('observed');
    expect((await run(state, 'oct08')).findings[0].action).toBe('observed');
    expect((await run(state, 'oct08')).findings[0].action).toBe('replayed');
    expect((await run(state)).findings[0].action).toBe('replayed');
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0]).toMatchObject({
      teamId: 'jovie-team',
      parentId: 'slo-parent',
      assigneeId: 'slo-owner',
      stateId: 'triage-state',
    });
    expect(state.issues[0].description).toContain('oct05');
    expect(state.issues[0].comments.map(row => row.body)).toEqual([
      expect.stringContaining('oct07'),
      expect.stringContaining('oct08'),
    ]);
    expect(
      state.calls.every(call => call.url === 'https://api.linear.app/graphql')
    ).toBe(true);
    expect(state.calls.some(call => /label/i.test(call.query))).toBe(false);
  });
  it('reuses an unlabeled exact title and preserves human content, assignment and state', async () => {
    const state = makeState();
    await run(state);
    Object.assign(state.issues[0], {
      description: 'Human hold and original finding',
      assigneeId: 'human',
      state: { type: 'started' },
    });
    expect((await run(state, 'oct07')).findings[0].issue).toBe('JOV-9001');
    expect(state.issues[0]).toMatchObject({
      description: 'Human hold and original finding',
      assigneeId: 'human',
      state: { type: 'started' },
    });
    state.issues[0].title += ' human edited';
    state.issues[0].description = state.issues[0].comments[0].body;
    expect((await run(state, 'oct08')).findings[0].issue).toBe('JOV-9001');
    expect(state.issues).toHaveLength(1);
  });
  it.each(['lookup', 'graphql', 'incomplete'])(
    'fails visibly without creating on %s lookup',
    async failure => {
      const state = makeState();
      state.failure = failure;
      expect(await run(state)).toMatchObject({
        status: 'failed',
        findings: [
          { status: 'failed', retryDecision: 'reconcile-before-retry' },
        ],
      });
      expect(state.calls.some(call => call.query.includes('mutation'))).toBe(
        false
      );
    }
  );
  it('missing credentials or owner routing never falls back to GitHub', async () => {
    const state = makeState();
    const receipt = await deliverReport(
      report(),
      { repo, runUrl: `https://github.com/${repo}/actions/runs/1` },
      { apiKey: '', fetchImpl: fakeLinear(state) }
    );
    expect(receipt.findings[0].reason).toBe('missing_linear_api_key');
    expect(state.calls).toHaveLength(0);
    state.owner = null;
    expect((await run(state)).findings[0].reason).toBe('owner_routing_missing');
    expect(state.issues).toHaveLength(0);
  });
  it.each(['create', 'comment', 'reopen'])(
    'does not retry an ambiguous %s and reconciles on restart',
    async operation => {
      const state = makeState();
      if (operation !== 'create') await run(state, 'earlier');
      if (operation === 'reopen') state.issues[0].state.type = 'completed';
      state.failure = `${operation}-after-write`;
      expect((await run(state)).findings[0].reason).toBe(
        `${operation}_result_unknown`
      );
      const next = await run(state);
      expect(next.status).toBe('succeeded');
      expect(state.issues).toHaveLength(1);
      expect(state.issues[0].comments).toHaveLength(
        operation === 'create' ? 0 : 1
      );
      expect(
        state.calls.filter(call => call.query.includes('ShippingSloCreate'))
      ).toHaveLength(1);
    }
  );
  it('keeps all four metric identities and flat growth separate across runs', async () => {
    const state = makeState();
    const input = report();
    input.evaluation.regressions = [
      'lead_time.devin.p95',
      'lead_time.codex.p95',
      'remediation.main_red_to_green.p95',
      'throughput.verified_per_day',
    ].map(key => ({ key, baseline: 100, observed: 130, changeFraction: 0.3 }));
    input.evaluation.flatStall = true;
    await run(state, 'oct05', input);
    await run(state, 'oct07', input);
    await run(state, 'oct07', input);
    expect(state.issues).toHaveLength(5);
    expect(state.issues.every(issue => issue.comments.length === 1)).toBe(true);
    expect(
      new Set(
        state.issues.map(
          issue => issue.description.match(/fingerprint: ([a-f0-9]+)/)[1]
        )
      ).size
    ).toBe(5);
  });
  it('duplicate canonical candidates fail without mutating either issue', async () => {
    const state = makeState();
    await run(state);
    state.issues.push({ ...state.issues[0], id: 'duplicate' });
    const calls = state.calls.length;
    expect((await run(state, 'oct07')).findings[0].reason).toBe(
      'ambiguous_canonical_issue'
    );
    expect(
      state.calls.slice(calls).some(call => call.query.includes('mutation'))
    ).toBe(false);
  });
  it('paginates recurrence history and detects replay beyond the first 100 comments', async () => {
    const state = makeState();
    await run(state);
    state.issues[0].comments = Array.from({ length: 100 }, () => ({
      body: 'old evidence',
    }));
    expect((await run(state, 'oct07')).findings[0].action).toBe('observed');
    expect((await run(state, 'oct07')).findings[0].action).toBe('replayed');
    expect(state.issues[0].comments).toHaveLength(101);
  });
  it('reopens the same completed metric in triage without replacing its body', async () => {
    const state = makeState();
    await run(state);
    const body = state.issues[0].description;
    state.issues[0].state.type = 'completed';
    expect((await run(state, 'oct07')).findings[0].action).toBe('observed');
    expect(state.issues[0]).toMatchObject({
      description: body,
      state: { type: 'triage' },
    });
    state.issues[0].archivedAt = '2026-10-09';
    expect((await run(state, 'oct08')).findings[0].reason).toBe(
      'canonical_issue_unavailable'
    );
    expect(state.issues).toHaveLength(1);
  });
  it('stops a sweep on a failed observation lookup and does not file later metrics', async () => {
    const state = makeState();
    await run(state);
    state.failure = 'comments';
    const input = report();
    input.evaluation.regressions.push({
      ...input.evaluation.regressions[0],
      key: 'lead_time.codex.p95',
    });
    expect((await run(state, 'oct07', input)).findings).toEqual([
      expect.objectContaining({ reason: 'comment_lookup_failed' }),
    ]);
    expect(state.issues).toHaveLength(1);
  });
  it('executes the real workflow filing command and retains Linear replay and failure receipts', () => {
    const step = parseYaml(WORKFLOW).jobs.measure.steps.find(
      step => step.name === 'File deduped Linear SLO regressions'
    );
    expect(step.env.LINEAR_API_KEY).toBe('${{ secrets.LINEAR_API_KEY }}');
    expect(step.env.GH_TOKEN).toBeUndefined();
    const dir = mkdtempSync(resolve(tmpdir(), 'jov8043-workflow-'));
    try {
      const statePath = resolve(dir, 'state.json');
      const reportPath = resolve(dir, 'report.json');
      writeFileSync(statePath, JSON.stringify(makeState()));
      writeFileSync(reportPath, JSON.stringify(report()));
      const execute = apiKey =>
        spawnSync(
          'bash',
          ['-c', step.run.replaceAll('${{ github.repository }}', repo)],
          {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            timeout: 15_000,
            env: {
              ...process.env,
              REPORT: reportPath,
              RUN_URL: `https://github.com/${repo}/actions/runs/123`,
              RUNNER_TEMP: dir,
              LINEAR_API_KEY: apiKey,
              SLO_OFFLINE_STATE: statePath,
              NODE_OPTIONS: `--import=${resolve(import.meta.dirname, 'fixtures/shipping-slo-fake-linear.mjs')}`,
            },
          }
        );
      const receipt = () =>
        JSON.parse(
          readFileSync(resolve(dir, 'shipping-slo-intake.json'), 'utf8')
        );
      expect(execute('slo-workflow-fixture').status).toBe(0);
      expect(receipt().findings[0]).toMatchObject({
        action: 'created',
        issue: 'JOV-9001',
      });
      expect(execute('slo-workflow-fixture').status).toBe(0);
      expect(receipt().findings[0].action).toBe('replayed');
      expect(execute('').status).toBe(1);
      expect(receipt().findings[0].reason).toBe('missing_linear_api_key');
      expect(JSON.parse(readFileSync(statePath, 'utf8')).issues).toHaveLength(
        1
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('preserves terminal state when replaying a run already observed before closure', async () => {
    const state = makeState();
    await run(state);
    state.issues[0].state.type = 'completed';
    expect((await run(state)).findings[0].action).toBe('replayed');
    expect(state.issues[0].state.type).toBe('completed');
  });
  it('does not call providers for a healthy report and rejects invalid identities', async () => {
    const state = makeState();
    expect((await run(state, 'oct05', {})).findings).toEqual([]);
    expect(state.calls).toHaveLength(0);
    await expect(
      upsertSloFinding({ repo: 'invalid', metric: 'invalid metric' })
    ).rejects.toMatchObject({ reason: 'invalid_finding_identity' });
  });
});

describe('production verification sources (JOV-8082)', () => {
  const verifiedBaseline = () =>
    baseline({
      'production_lag.merged_to_verified.p95': {
        value: 1800,
        unit: 'seconds',
        direction: 'lower',
      },
      'throughput.verified_per_day': {
        value: 15,
        unit: 'per_day',
        direction: 'higher',
      },
    });

  it('counts a merge as verified by a later generation, not only exact sha', () => {
    const prs = [
      { mergedAt: ago(2), mergeCommitSha: 'older-ancestor' },
      { mergedAt: ago(1), mergeCommitSha: 'tip' },
    ];
    const events = [
      {
        status: 'success',
        createdAt: new Date(NOW - DAY / 2).toISOString(),
        sha: 'tip',
      },
    ];
    const lag = productionLag(prs, events, NOW - 7 * DAY, NOW);
    expect(lag.merged).toBe(2);
    expect(lag.verified).toBe(2);
  });

  it('writes non-null lag and verified/day when controller verifications exist', () => {
    const report = buildReport(
      {
        runs: { pull_request: [], merge_group: [], main: [] },
        mergedPrs: [
          {
            number: 1,
            title: 'x',
            headRefName: 'devin/x',
            createdAt: ago(3),
            mergedAt: ago(2),
            mergeCommitSha: 'ancestor',
          },
        ],
        timelines: {},
        deployments: [],
        productionVerifications: [{ sha: 'tip', verifiedAt: ago(1) }],
      },
      verifiedBaseline(),
      { now: NOW }
    );
    expect(
      report.flat['production_lag.merged_to_verified.p95']
    ).toBeGreaterThan(0);
    expect(report.flat['throughput.verified_per_day']).toBeCloseTo(1 / 7);
  });

  it('honours per-PR Production Verified check evidence', () => {
    const report = buildReport(
      {
        runs: { pull_request: [], merge_group: [], main: [] },
        mergedPrs: [
          {
            number: 1,
            title: 'x',
            headRefName: 'devin/x',
            createdAt: ago(3),
            mergedAt: ago(2),
            mergeCommitSha: 'abc',
            productionVerifiedAt: ago(1),
          },
        ],
        timelines: {},
        deployments: [],
      },
      verifiedBaseline(),
      { now: NOW }
    );
    expect(report.flat['throughput.verified_per_day']).toBeCloseTo(1 / 7);
  });

  it('nulls verified metrics instead of filing a regression on zero evidence', () => {
    const report = buildReport(
      {
        runs: { pull_request: [], merge_group: [], main: [] },
        mergedPrs: [
          {
            number: 1,
            title: 'x',
            headRefName: 'devin/x',
            createdAt: ago(3),
            mergedAt: ago(2),
            mergeCommitSha: 'abc',
          },
        ],
        timelines: {},
        deployments: [],
      },
      verifiedBaseline(),
      { now: NOW }
    );
    expect(report.flat['throughput.verified_per_day']).toBeNull();
    expect(report.evaluation.regressions.map(r => r.key)).not.toContain(
      'throughput.verified_per_day'
    );
  });
});

describe('unsupported promote-hold metric (JOV-8082)', () => {
  it('is never evaluated even when a flat value is present', () => {
    const flat = { 'remediation.production_promote_hold.p95': 99999 };
    const base = baseline({
      'remediation.production_promote_hold.p95': {
        value: 100,
        unit: 'seconds',
        direction: 'lower',
      },
    });
    const { regressions, tightenCandidates } = evaluateShippingSlo(flat, base);
    expect(regressions).toEqual([]);
    expect(tightenCandidates).toEqual([]);
  });

  it('validateBaseline rejects baselining an unsupported metric', () => {
    const base = baseline({
      'remediation.production_promote_hold.p95': {
        value: 3600,
        unit: 'seconds',
        direction: 'lower',
      },
    });
    const { ok, errors } = validateBaseline(base);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toContain('unsupported');
  });
});
