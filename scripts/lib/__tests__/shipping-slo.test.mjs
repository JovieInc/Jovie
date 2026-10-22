import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  deliverReport,
  sloFingerprint,
} from '../../shipping-slo-intake.mjs';
import { buildReport, collectRaw } from '../../shipping-slo-report.mjs';

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

  it('requests check and status read for stage evidence queries', () => {
    expect(WORKFLOW).toContain('permission-checks: read');
    expect(WORKFLOW).toContain('permission-statuses: read');
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
  const owner = {
    id: 'slo-owner',
    assignee: { id: 'devin' },
    team: {
      id: 'team-1',
      states: { nodes: [{ id: 'triage', type: 'triage' }] },
    },
  };
  const makeState = () => ({
    issues: [],
    comments: [],
    creates: [],
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
  const json = body => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
  const fetchImpl = state => async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    const query = payload.query;
    if (query.includes('issueLabelCreate') || query.includes('labelIds')) {
      throw new Error('SLO intake must not create a Linear label');
    }
    if (state.failure === 'lookup' && query.includes('ShippingSloOwner')) {
      return json({ errors: [{ message: 'owner lookup failed' }] });
    }
    if (query.includes('ShippingSloOwner')) {
      return json({ data: { issue: owner } });
    }
    if (query.includes('ShippingSloIssues')) {
      const title = payload.variables.title;
      const marker = payload.variables.marker;
      const nodes = state.issues.filter(
        issue => issue.title === title || issue.description.includes(marker)
      );
      return json({
        data: {
          issues: {
            nodes,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    if (query.includes('ShippingSloCreate')) {
      const input = payload.variables.input;
      state.creates.push(input);
      const issue = {
        id: `iss-${state.issues.length + 1}`,
        identifier: `JOV-${8000 + state.issues.length}`,
        url: 'https://linear.app/jovie/issue/test',
        title: input.title,
        description: input.description,
        archivedAt: null,
        state: { type: 'triage' },
      };
      state.issues.push(issue);
      return json({
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              url: issue.url,
            },
          },
        },
      });
    }
    if (query.includes('ShippingSloComments')) {
      const id = payload.variables.id;
      return json({
        data: {
          issue: {
            comments: {
              nodes: state.comments.filter(comment => comment.issueId === id),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      });
    }
    if (query.includes('commentCreate')) {
      state.comments.push({
        issueId: payload.variables.id,
        body: payload.variables.body,
      });
      return json({
        data: { commentCreate: { success: true, comment: { id: 'comment-1' } } },
      });
    }
    if (query.includes('ReopenLinearIssue')) {
      const issue = state.issues.find(row => row.id === payload.variables.id);
      issue.state = { type: 'triage' };
      return json({ data: { issueUpdate: { success: true } } });
    }
    throw new Error(query.slice(0, 80));
  };
  const run = (state, id = 'oct05', input = report()) =>
    deliverReport(input, {
      repo,
      runUrl: `https://github.com/${repo}/actions/runs/${id}`,
      apiKey: 'lin_test',
      fetchImpl: fetchImpl(state),
    });

  it('keeps the metric identity inside a 64-hex fingerprint, not a Linear label', () => {
    const fingerprint = sloFingerprint(repo, 'merge_queue.wait.p95');
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
    const asLabel = `remediation:shipping-slo:${repo}:${'merge_queue.wait.p95'}`;
    assert.ok(asLabel.length <= 80);
    assert.equal(asLabel.includes('~'), false);
  });

  it('files merge_queue.wait.p95 in Linear and dedupes the next run', async () => {
    const state = makeState();
    const input = report('merge_queue.wait.p95');
    const first = await run(state, '39782428315', input);
    assert.equal(first.status, 'succeeded');
    assert.equal(first.findings[0].action, 'created');
    assert.equal(first.findings[0].issue, 'JOV-8000');
    assert.equal(state.creates.length, 1);
    assert.equal(state.creates[0].parentId, 'slo-owner');
    assert.equal('labelIds' in state.creates[0], false);
    assert.match(state.issues[0].description, /39782428315/);
    const original = state.issues[0].description;
    const second = await run(state, 'next', input);
    assert.equal(second.findings[0].action, 'observed');
    assert.equal(second.findings[0].issue, 'JOV-8000');
    assert.equal(state.creates.length, 1);
    assert.equal(state.issues[0].description, original);
    assert.equal(state.comments.length, 1);
    assert.match(state.comments[0].body, /actions\/runs\/next/);
    const replay = await run(state, 'next', input);
    assert.equal(replay.findings[0].action, 'replayed');
    assert.equal(state.comments.length, 1);
  });

  it('lookup failure performs no create', async () => {
    const state = makeState();
    state.failure = 'lookup';
    const receipt = await run(
      state,
      '39782428315',
      report('merge_queue.wait.p95')
    );
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.owner, 'Devin');
    assert.equal(receipt.findings[0].metric, 'merge_queue.wait.p95');
    assert.equal(receipt.findings[0].reason, 'owner_lookup_failed');
    assert.equal(receipt.findings[0].retryDecision, 'reconcile-before-retry');
    assert.equal(state.creates.length, 0);
  });

  it('distinct metrics and flat-growth investigations have distinct stable identities', async () => {
    const state = makeState();
    await run(state);
    await run(state, 'oct05', report('lead_time.codex.p95'));
    const input = report();
    input.evaluation.flatStall = true;
    await run(state, 'oct05', input);
    assert.equal(state.issues.length, 3);
    assert.equal(
      new Set(
        state.issues.map(
          issue => issue.description.match(/fingerprint: ([0-9a-f]+)/)[1]
        )
      ).size,
      3
    );
  });

  it('passes the existing Linear key into the filing step', () => {
    const fileStep = WORKFLOW.slice(
      WORKFLOW.indexOf('File deduped slo-regression issues')
    );
    expect(fileStep).toContain('LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}');
    expect(fileStep.slice(0, fileStep.indexOf('run:'))).not.toContain(
      'GH_TOKEN'
    );
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
