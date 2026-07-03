import { describe, expect, it } from 'vitest';
import {
  CI_METRICS_SCHEMA_VERSION,
  ciRunHours,
  completedDurationsSeconds,
  evaluateMergeQueueThroughput,
  flakyRerunRate,
  fullMergeTimesSeconds,
  gateDurationsSeconds,
  mergedThroughput,
  MIN_READY_TO_MERGE_SAMPLES,
  percentilesOf,
  queueWaitSeconds,
  READY_TO_MERGE_P50_TARGET_SECONDS,
  READY_TO_MERGE_P95_TARGET_SECONDS,
  readyToMergeSeconds,
  summarizeCiMetrics,
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
  it('extracts positive readyToMergedSeconds', () => {
    const tl = [
      { readyToMergedSeconds: 300 },
      { readyToMergedSeconds: null },
      { readyToMergedSeconds: 0 },
      { readyToMergedSeconds: 900 },
    ];
    expect(readyToMergeSeconds(tl)).toEqual([300, 900]);
  });

  it('returns [] for nullish input', () => {
    expect(readyToMergeSeconds(undefined)).toEqual([]);
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

  it('recommends raising max queue depth when p95 is off target', () => {
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
    expect(verdict.action).toContain('raise_max_queue_depth_12_to_16');
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
      { queuedToMergedSeconds: 240, readyToMergedSeconds: 500 },
      { queuedToMergedSeconds: 480, readyToMergedSeconds: 700 },
    ];
    const out = summarizeCiMetrics({
      ts: '2026-06-19T13:00:00Z',
      runs,
      prs,
      timelineResults,
    });

    expect(out.schemaVersion).toBe(CI_METRICS_SCHEMA_VERSION);
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
    expect(out.sampleSizes).toEqual({
      gate: 2,
      fullMerge: 2,
      queueWait: 2,
      readyToMerge: 2,
    });
    expect(out.throughputVerdict.status).toBe('defer');
    expect(out.throughputVerdict.action).toBe('wait_for_evaluation_window');
  });
});
