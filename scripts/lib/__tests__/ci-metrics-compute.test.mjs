import { describe, expect, it } from 'vitest';
import {
  activeQueuedSeconds,
  CI_METRICS_REQUIRED_STATUSES,
  CI_METRICS_SCHEMA_VERSION,
  ciRunHours,
  completedDurationsSeconds,
  createApiRequestBudget,
  evaluateMergeQueueThroughput,
  flakyRerunRate,
  fleetLeadTimeSeconds,
  fullMergeTimesSeconds,
  gateDurationsSeconds,
  hasCompleteRequiredChecks,
  hasGreenRequiredChecks,
  lastEnqueueToMergeSeconds,
  MIN_READY_TO_MERGE_SAMPLES,
  mergedThroughput,
  percentilesOf,
  queueWaitSeconds,
  READY_TO_MERGE_P50_TARGET_SECONDS,
  READY_TO_MERGE_P95_TARGET_SECONDS,
  readyToMergeSeconds,
  shouldReuseJobCache,
  shouldReuseRequiredChecksCache,
  summarizeCiMetrics,
  summarizeJobMetrics,
} from '../ci-metrics-compute.mjs';

const run = (
  createdAt,
  updatedAt,
  attempt = 1,
  status = 'completed',
  conclusion = 'success'
) => ({
  status,
  conclusion,
  created_at: createdAt,
  updated_at: updatedAt,
  run_attempt: attempt,
});

describe('gateDurationsSeconds', () => {
  it('counts SUCCESSFUL completed runs only (matches the ratchet)', () => {
    const runs = [
      run('2026-06-19T10:00:00Z', '2026-06-19T10:10:00Z'), // 600 success
      run('2026-06-19T11:00:00Z', '2026-06-19T11:05:00Z'), // 300 success
      run('2026-06-19T12:00:00Z', '2026-06-19T12:00:00Z'), // 0 → dropped
      run(
        '2026-06-19T13:00:00Z',
        '2026-06-19T13:30:00Z',
        1,
        'completed',
        'failure'
      ), // excluded
      { ...run('a', 'b'), status: 'in_progress' }, // dropped
    ];
    expect(gateDurationsSeconds(runs)).toEqual([600, 300]);
  });

  it('returns [] for nullish input', () => {
    expect(gateDurationsSeconds(undefined)).toEqual([]);
  });
});

describe('completedDurationsSeconds', () => {
  it('counts ALL completed runs regardless of conclusion (slot-hours basis)', () => {
    const runs = [
      run('2026-06-19T10:00:00Z', '2026-06-19T10:10:00Z'), // 600 success
      run(
        '2026-06-19T13:00:00Z',
        '2026-06-19T13:30:00Z',
        1,
        'completed',
        'failure'
      ), // 1800 failure counts
      { ...run('a', 'b'), status: 'in_progress' }, // dropped
    ];
    expect(completedDurationsSeconds(runs)).toEqual([600, 1800]);
  });
});

describe('fullMergeTimesSeconds', () => {
  it('computes createdAt→mergedAt for merged PRs', () => {
    const prs = [
      { createdAt: '2026-06-19T10:00:00Z', mergedAt: '2026-06-19T10:30:00Z' }, // 1800
      { createdAt: '2026-06-19T10:00:00Z', mergedAt: null }, // dropped
    ];
    expect(fullMergeTimesSeconds(prs)).toEqual([1800]);
  });
});

describe('flakyRerunRate', () => {
  it('is the fraction of runs with run_attempt > 1', () => {
    const runs = [
      run('a', 'b', 1),
      run('a', 'b', 2),
      run('a', 'b', 3),
      run('a', 'b', 1),
    ];
    expect(flakyRerunRate(runs)).toBe(0.5);
  });
  it('is 0 with no runs', () => {
    expect(flakyRerunRate([])).toBe(0);
  });
});

describe('ciRunHours', () => {
  it('sums all completed run wall-clock into hours (incl. failures)', () => {
    const runs = [
      run('2026-06-19T10:00:00Z', '2026-06-19T10:30:00Z'), // 1800s success
      run(
        '2026-06-19T11:00:00Z',
        '2026-06-19T11:30:00Z',
        1,
        'completed',
        'failure'
      ), // 1800s failure
    ];
    expect(ciRunHours(runs)).toBe(1); // 3600s — failures burn slots too
  });
});

describe('mergedThroughput', () => {
  it('averages merged PRs across the window span (>=1 day floor)', () => {
    const prs = [
      { mergedAt: '2026-06-10T00:00:00Z' },
      { mergedAt: '2026-06-12T00:00:00Z' },
      { mergedAt: '2026-06-14T00:00:00Z' }, // span = 4 days, 3 PRs → 0.75/day
    ];
    const t = mergedThroughput(prs);
    expect(t.mergedCount).toBe(3);
    expect(t.spanDays).toBe(4);
    expect(t.mergedPrsPerDay).toBeCloseTo(0.75, 5);
  });

  it('clamps span to 1 day for a same-day burst', () => {
    const prs = [
      { mergedAt: '2026-06-10T09:00:00Z' },
      { mergedAt: '2026-06-10T10:00:00Z' },
    ];
    expect(mergedThroughput(prs).mergedPrsPerDay).toBe(2); // 2 / max(span,1)
  });

  it('returns zeros for no merged PRs', () => {
    expect(mergedThroughput([])).toEqual({
      mergedPrsPerDay: 0,
      spanDays: 0,
      mergedCount: 0,
    });
  });
});

describe('queueWaitSeconds', () => {
  it('extracts positive queuedToMergedSeconds', () => {
    const tl = [
      { queuedToMergedSeconds: 120 },
      { queuedToMergedSeconds: null },
      { queuedToMergedSeconds: 0 },
      { queuedToMergedSeconds: 300 },
    ];
    expect(queueWaitSeconds(tl)).toEqual([120, 300]);
  });
});

describe('readyToMergeSeconds', () => {
  it('keeps the v1 helper as an alias for fleet lead time', () => {
    const tl = [
      { readyToMergedSeconds: 300 },
      { readyToMergedSeconds: null },
      { readyToMergedSeconds: 0 },
      { readyToMergedSeconds: 900 },
    ];
    expect(fleetLeadTimeSeconds(tl)).toEqual([300, 900]);
    expect(readyToMergeSeconds(tl)).toEqual([300, 900]);
  });

  it('returns [] for nullish input', () => {
    expect(readyToMergeSeconds(undefined)).toEqual([]);
  });
});

describe('queue interval metrics', () => {
  it('extracts first, last, and active queue durations independently', () => {
    const timelines = [
      {
        firstEnqueueToMergedSeconds: 5400,
        lastEnqueueToMergedSeconds: 1800,
        activeQueuedSeconds: 3660,
      },
      {
        firstEnqueueToMergedSeconds: null,
        lastEnqueueToMergedSeconds: null,
        activeQueuedSeconds: null,
      },
    ];

    expect(queueWaitSeconds(timelines)).toEqual([5400]);
    expect(lastEnqueueToMergeSeconds(timelines)).toEqual([1800]);
    expect(activeQueuedSeconds(timelines)).toEqual([3660]);
  });
});

const greenChecks = completedAt =>
  CI_METRICS_REQUIRED_STATUSES.map(name => ({
    name,
    completed_at: completedAt,
    conclusion: 'success',
  }));

describe('summarizeJobMetrics', () => {
  it('reports runner classes, waste, failures, required green, and skips', () => {
    const out = summarizeJobMetrics([
      {
        runCreatedAt: '2026-07-10T10:00:00Z',
        runConclusion: 'failure',
        requiredChecks: greenChecks('2026-07-10T10:07:00Z'),
        jobs: [
          {
            labels: ['ubuntu-latest'],
            started_at: '2026-07-10T10:00:20Z',
            completed_at: '2026-07-10T10:05:20Z',
            conclusion: 'cancelled',
          },
          {
            labels: ['self-hosted'],
            started_at: '2026-07-10T10:00:40Z',
            completed_at: '2026-07-10T10:02:40Z',
            conclusion: 'failure',
          },
          {
            labels: ['ubuntu-latest'],
            started_at: '2026-07-10T10:05:20Z',
            completed_at: '2026-07-10T10:06:00Z',
            conclusion: 'success',
          },
          {
            labels: ['ubuntu-latest'],
            started_at: '2026-07-10T10:05:00Z',
            completed_at: '2026-07-10T10:05:30Z',
            conclusion: 'skipped',
          },
        ],
      },
      {
        runCreatedAt: '2026-07-10T12:00:00Z',
        runConclusion: 'cancelled',
        jobs: [
          {
            labels: ['self-hosted'],
            started_at: '2026-07-10T12:01:00Z',
            completed_at: '2026-07-10T12:02:00Z',
            conclusion: 'success',
          },
        ],
      },
    ]);

    expect(out.runnerSeconds).toEqual({ hosted: 340, selfHosted: 180 });
    expect(out.cancellationWasteSeconds).toBe(360);
    expect(out.timeToFirstTerminalFailureSeconds.p50).toBe(160);
    expect(out.timeToRequiredGreenSeconds.p50).toBe(420);
    expect(out.sampleSizes.jobs).toBe(4);
  });

  it('ignores missing and negative timestamps', () => {
    const out = summarizeJobMetrics([
      {
        runCreatedAt: '2026-07-10T11:00:00Z',
        jobs: [
          { conclusion: 'skipped', started_at: null, completed_at: null },
          {
            labels: ['self-hosted'],
            started_at: '2026-07-10T10:59:00Z',
            completed_at: '2026-07-10T10:58:00Z',
            conclusion: 'success',
          },
        ],
      },
    ]);
    expect(out.runnerSeconds).toEqual({ hosted: 0, selfHosted: 0 });
    expect(out.sampleSizes.jobStartDelay).toBe(0);
  });

  it('counts an immediate job start as a zero-second delay sample', () => {
    const out = summarizeJobMetrics([
      {
        runCreatedAt: '2026-07-10T11:00:00Z',
        jobs: [
          {
            labels: ['ubuntu-latest'],
            started_at: '2026-07-10T11:00:00Z',
            completed_at: '2026-07-10T11:01:00Z',
            conclusion: 'success',
          },
        ],
      },
    ]);

    expect(out.jobStartDelaySeconds.p50).toBe(0);
    expect(out.sampleSizes.jobStartDelay).toBe(1);
  });
});

describe('CI metrics API cache policy', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  const run = {
    created_at: '2026-07-11T10:00:00Z',
    updated_at: '2026-07-11T11:00:00Z',
  };
  const cache = (green, fetchedAt) => ({
    green,
    fetchedAt,
  });

  it('keys jobs by updated_at and bounds required-check refreshes', () => {
    expect(shouldReuseJobCache(run, { updatedAt: run.updated_at })).toBe(true);
    expect(shouldReuseJobCache(run, { updatedAt: 'changed' })).toBe(false);
    expect(
      shouldReuseRequiredChecksCache(
        run,
        cache(true, '2026-07-11T11:00:00Z'),
        now
      )
    ).toBe(true);
    expect(
      shouldReuseRequiredChecksCache(
        run,
        cache(false, '2026-07-11T08:00:00Z'),
        now
      )
    ).toBe(true);
    expect(
      shouldReuseRequiredChecksCache(
        run,
        cache(false, '2026-07-11T05:00:00Z'),
        now
      )
    ).toBe(false);
    expect(
      shouldReuseRequiredChecksCache(
        { ...run, created_at: '2026-07-09T10:00:00Z' },
        cache(false, '2026-07-09T11:00:00Z'),
        now
      )
    ).toBe(false);
  });

  it('refreshes green and old non-green caches at the 24-hour boundary', () => {
    const oldRun = { ...run, created_at: '2026-07-09T10:00:00Z' };
    for (const green of [true, false]) {
      expect(
        shouldReuseRequiredChecksCache(
          oldRun,
          cache(green, '2026-07-10T12:00:01Z'),
          now
        )
      ).toBe(true);
      expect(
        shouldReuseRequiredChecksCache(
          oldRun,
          cache(green, '2026-07-10T12:00:00Z'),
          now
        )
      ).toBe(false);
    }
  });

  it('refreshes terminal red and then reuses rerun-success checks', () => {
    const failed = greenChecks(now.toISOString());
    failed[0] = { ...failed[0], conclusion: 'failure' };
    expect(hasCompleteRequiredChecks(failed)).toBe(true);
    expect(hasGreenRequiredChecks(failed)).toBe(false);
    expect(
      shouldReuseRequiredChecksCache(
        run,
        cache(false, '2026-07-11T04:00:00Z'),
        now
      )
    ).toBe(false);
    expect(hasGreenRequiredChecks(greenChecks(now.toISOString()))).toBe(true);
    expect(
      shouldReuseRequiredChecksCache(run, cache(true, now.toISOString()), now)
    ).toBe(true);
  });

  it.each([
    'missing',
    'pending',
    'failed',
  ])('does not report required green when PR Size Guard is %s', state => {
    const checks = greenChecks(now.toISOString()).filter(
      check => !(state === 'missing' && check.name === 'PR Size Guard')
    );
    if (state !== 'missing') {
      const index = checks.findIndex(check => check.name === 'PR Size Guard');
      checks[index] = {
        ...checks[index],
        conclusion: state === 'pending' ? null : 'failure',
      };
    }

    expect(hasCompleteRequiredChecks(checks)).toBe(state === 'failed');
    expect(hasGreenRequiredChecks(checks)).toBe(false);
    expect(
      summarizeJobMetrics([
        {
          runCreatedAt: '2026-07-11T10:00:00Z',
          requiredChecks: checks,
          jobs: [],
        },
      ]).sampleSizes.requiredGreen
    ).toBe(0);
  });

  it('reuses one SHA-scoped check fetch across runs with different updated_at values', () => {
    const fetched = cache(true, now.toISOString());
    expect(
      shouldReuseRequiredChecksCache(
        { ...run, updated_at: '2026-07-11T11:30:00Z' },
        fetched,
        now
      )
    ).toBe(true);
  });

  it('treats a newer skipped execution as authoritative over older success', () => {
    const checks = greenChecks('2026-07-11T10:00:00Z');
    checks.push({
      name: 'PR Ready',
      completed_at: '2026-07-11T11:00:00Z',
      conclusion: 'skipped',
    });

    expect(hasCompleteRequiredChecks(checks)).toBe(false);
    expect(hasGreenRequiredChecks(checks)).toBe(false);
  });

  it('keeps a newer pending execution authoritative when an older success finishes later', () => {
    const checks = greenChecks('2026-07-11T11:10:00Z');
    const ready = checks.findIndex(check => check.name === 'PR Ready');
    checks[ready] = {
      ...checks[ready],
      id: 100,
      started_at: '2026-07-11T10:00:00Z',
      completed_at: '2026-07-11T11:10:00Z',
    };
    checks.push({
      id: 101,
      name: 'PR Ready',
      started_at: '2026-07-11T11:00:00Z',
      completed_at: null,
      conclusion: null,
    });

    expect(hasCompleteRequiredChecks(checks)).toBe(false);
    expect(hasGreenRequiredChecks(checks)).toBe(false);
  });

  it('uses check-run id over start time when executions overlap', () => {
    const checks = greenChecks('2026-07-11T11:20:00Z');
    const ready = checks.findIndex(check => check.name === 'PR Ready');
    checks[ready] = {
      ...checks[ready],
      id: 100,
      started_at: '2026-07-11T11:00:00Z',
      completed_at: '2026-07-11T11:20:00Z',
    };
    checks.push({
      id: 101,
      name: 'PR Ready',
      started_at: '2026-07-11T10:55:00Z',
      completed_at: null,
      conclusion: null,
    });

    expect(hasCompleteRequiredChecks(checks)).toBe(false);
    expect(hasGreenRequiredChecks(checks)).toBe(false);
  });

  it('uses check-run id when the newer queued execution has no timestamps', () => {
    const checks = greenChecks('2026-07-11T11:20:00Z');
    const ready = checks.findIndex(check => check.name === 'PR Ready');
    checks[ready] = { ...checks[ready], id: 100 };
    checks.push({
      id: 101,
      name: 'PR Ready',
      started_at: null,
      completed_at: null,
      conclusion: null,
    });

    expect(hasCompleteRequiredChecks(checks)).toBe(false);
    expect(hasGreenRequiredChecks(checks)).toBe(false);
  });
});

describe('CI metrics API request budget', () => {
  it('caps cold-cache request fanout and stops at the elapsed deadline', () => {
    let nowMs = 1_000;
    const byCount = createApiRequestBudget({
      maxRequests: 2,
      maxElapsedMs: 10_000,
      now: () => nowMs,
    });
    expect(byCount.tryConsume()).toBe(true);
    expect(byCount.tryConsume()).toBe(true);
    expect(byCount.tryConsume()).toBe(false);
    expect(byCount.used).toBe(2);

    const byTime = createApiRequestBudget({
      maxRequests: 10,
      maxElapsedMs: 500,
      now: () => nowMs,
    });
    expect(byTime.tryConsume()).toBe(true);
    nowMs += 500;
    expect(byTime.tryConsume()).toBe(false);
    expect(byTime.used).toBe(1);
  });

  it('reserves requests for later hydration without exceeding the global cap', () => {
    const budget = createApiRequestBudget({
      maxRequests: 4,
      maxElapsedMs: 10_000,
    });

    expect(budget.tryConsume(2)).toBe(true);
    expect(budget.tryConsume(2)).toBe(true);
    expect(budget.tryConsume(2)).toBe(false);
    expect(budget.used).toBe(2);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.used).toBe(4);
  });
});

describe('percentilesOf', () => {
  it('returns p50/p75/p95', () => {
    expect(percentilesOf([10, 20, 30, 40, 50])).toEqual({
      p50: 30,
      p75: 40,
      p95: 50,
    });
  });
  it('returns zeros for empty', () => {
    expect(percentilesOf([])).toEqual({ p50: 0, p75: 0, p95: 0 });
  });
});

const metricsFixture = (overrides = {}) => ({
  latency: {
    readyToMergeSeconds: { p50: 480, p75: 600, p95: 840 },
  },
  sampleSizes: { readyToMerge: MIN_READY_TO_MERGE_SAMPLES },
  ...overrides,
});

const afterEvalWindow = new Date('2026-07-10T12:00:00Z');

describe('evaluateMergeQueueThroughput', () => {
  it('defers before the 2026-07-09 evaluation window', () => {
    const verdict = evaluateMergeQueueThroughput(metricsFixture(), {
      now: new Date('2026-07-02T12:00:00Z'),
    });
    expect(verdict.status).toBe('defer');
    expect(verdict.action).toBe('wait_for_evaluation_window');
  });

  it('requires minimum samples after the evaluation window', () => {
    const verdict = evaluateMergeQueueThroughput(
      metricsFixture({ sampleSizes: { readyToMerge: 3 } }),
      { now: afterEvalWindow }
    );
    expect(verdict.status).toBe('insufficient_data');
    expect(verdict.action).toBe('collect_more_samples');
  });

  it('closes the follow-up when p50 and p95 are on target', () => {
    const verdict = evaluateMergeQueueThroughput(
      metricsFixture({
        latency: {
          readyToMergeSeconds: {
            p50: READY_TO_MERGE_P50_TARGET_SECONDS - 60,
            p75: 700,
            p95: READY_TO_MERGE_P95_TARGET_SECONDS - 60,
          },
        },
      }),
      { now: afterEvalWindow }
    );
    expect(verdict.status).toBe('on_target');
    expect(verdict.action).toBe('close_follow_up');
  });

  it('does not recommend a queue depth that is already active', () => {
    const verdict = evaluateMergeQueueThroughput(
      metricsFixture({
        latency: {
          readyToMergeSeconds: {
            p50: READY_TO_MERGE_P50_TARGET_SECONDS - 60,
            p75: 1200,
            p95: READY_TO_MERGE_P95_TARGET_SECONDS + 120,
          },
        },
      }),
      { now: afterEvalWindow }
    );
    expect(verdict.status).toBe('off_target');
    expect(verdict.action).toContain(
      'investigate_runner_capacity_and_queue_churn'
    );
    expect(verdict.action).not.toContain('raise_max_queue_depth_12_to_16');
    expect(verdict.queuePolicy.maxQueueDepth).toBe(16);
  });
});

describe('summarizeCiMetrics', () => {
  it('assembles a complete record with primary throughput + secondary latency', () => {
    const runs = [
      run('2026-06-19T10:00:00Z', '2026-06-19T10:10:00Z', 1), // 600
      run('2026-06-19T11:00:00Z', '2026-06-19T11:20:00Z', 2), // 1200, rerun
    ];
    const prs = [
      { createdAt: '2026-06-18T10:00:00Z', mergedAt: '2026-06-18T11:00:00Z' }, // 3600
      { createdAt: '2026-06-19T10:00:00Z', mergedAt: '2026-06-19T12:00:00Z' }, // 7200
    ];
    const timelineResults = [
      {
        queuedToMergedSeconds: 240,
        lastEnqueueToMergedSeconds: 180,
        activeQueuedSeconds: 200,
        readyToMergedSeconds: 500,
      },
      {
        queuedToMergedSeconds: 480,
        lastEnqueueToMergedSeconds: 300,
        activeQueuedSeconds: 420,
        readyToMergedSeconds: 700,
      },
    ];
    const out = summarizeCiMetrics({
      ts: '2026-06-19T13:00:00Z',
      runs,
      prs,
      timelineResults,
    });

    expect(CI_METRICS_SCHEMA_VERSION).toBe(2);
    expect(out.schemaVersion).toBe(CI_METRICS_SCHEMA_VERSION);
    expect(out.hydration.complete).toBe(true);
    expect(out.ts).toBe('2026-06-19T13:00:00Z');
    // span = 25h = 1.042d; p50 of two values is the lower (nearest-rank).
    expect(out.window).toEqual({ mergedPrs: 2, ciRuns: 2, spanDays: 1.042 });
    expect(out.throughput.flakyRerunRate).toBe(0.5);
    expect(out.throughput.queueWaitSeconds).toEqual({
      p50: 240,
      p75: 480,
      p95: 480,
    });
    // ciRunHours = (600+1200)/3600 = 0.5; per merged PR = 0.5/2 = 0.25
    expect(out.throughput.ciRunHoursPerMergedPr).toBe(0.25);
    expect(out.latency.gateWallclockSeconds.p95).toBe(1200);
    expect(out.latency.fullMergeTimeSeconds).toEqual({
      p50: 3600,
      p75: 7200,
      p95: 7200,
    });
    expect(out.latency.readyToMergeSeconds).toEqual({
      p50: 500,
      p75: 700,
      p95: 700,
    });
    expect(out.latency.fleetLeadTimeSeconds).toEqual(
      out.latency.readyToMergeSeconds
    );
    expect(out.latency.lastEnqueueToMergeSeconds.p95).toBe(300);
    expect(out.latency.activeQueuedSeconds.p95).toBe(420);
    expect(out.sampleSizes).toMatchObject({
      gate: 2,
      fullMerge: 2,
      queueWait: 2,
      readyToMerge: 2,
      fleetLeadTime: 2,
      firstEnqueueLead: 2,
      lastEnqueueToMerge: 2,
      activeQueued: 2,
    });
    expect(out.throughputVerdict.status).toBe('defer');
    expect(out.throughputVerdict.action).toBe('wait_for_evaluation_window');
  });

  it('marks a cold snapshot partial and prevents an authoritative verdict', () => {
    const out = summarizeCiMetrics({
      ts: '2026-07-10T12:00:00Z',
      runs: [],
      prs: [],
      timelineResults: [],
      hydration: {
        runJobs: { covered: 0, total: 100 },
        requiredChecks: { covered: 0, total: 90 },
        timelines: { covered: 0, total: 50 },
      },
    });

    expect(out.hydration.complete).toBe(false);
    expect(out.hydration.timelines).toEqual({ covered: 0, total: 50 });
    expect(out.throughputVerdict.status).toBe('insufficient_data');
    expect(out.throughputVerdict.action).toBe('hydrate_remaining_api_samples');
  });

  it('keeps a data-rich partial snapshot non-authoritative until coverage is complete', () => {
    const timelineResults = Array.from({ length: 10 }, () => ({
      readyToMergedSeconds: 300,
    }));
    const base = {
      ts: '2026-07-10T12:00:00Z',
      runs: [],
      prs: [],
      timelineResults,
      hydration: {
        runJobs: { covered: 0, total: 0 },
        requiredChecks: { covered: 0, total: 0 },
        timelines: { covered: 9, total: 10 },
      },
    };

    const partial = summarizeCiMetrics(base);
    expect(partial.throughputVerdict.status).toBe('insufficient_data');

    const complete = summarizeCiMetrics({
      ...base,
      hydration: {
        ...base.hydration,
        timelines: { covered: 10, total: 10 },
      },
    });
    expect(complete.hydration.complete).toBe(true);
    expect(complete.throughputVerdict.status).toBe('on_target');
    expect(complete.throughputVerdict.action).toBe('close_follow_up');
  });
});
