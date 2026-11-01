import { describe, expect, it } from 'vitest';
import {
  criticalPath,
  digestBlock,
  queueWaits,
  successByWindow,
  summarize,
} from '../merge-queue-speed.mjs';

const NOW = Date.UTC(2026, 9, 31, 24, 0, 0);
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const run = (id, conclusion, minutesAgo, wallMin = 10, extra = {}) => ({
  id,
  status: 'completed',
  conclusion,
  created_at: at(minutesAgo),
  run_started_at: at(minutesAgo),
  updated_at: at(minutesAgo - wallMin),
  ...extra,
});
const job = (name, startAgo, endAgo, conclusion = 'success') => ({
  name,
  conclusion,
  started_at: at(startAgo),
  completed_at: at(endAgo),
});

describe('merge-queue speed', () => {
  it('rates group success over trailing windows, excluding cancelled from the gate', () => {
    const runs = [
      run(1, 'success', 30),
      run(2, 'failure', 60),
      run(3, 'cancelled', 90),
      run(4, 'success', 600),
      { ...run(5, 'success', 10), status: 'in_progress' },
    ];
    const w = successByWindow(runs, NOW);
    expect(w['2h']).toMatchObject({
      success: 1,
      failure: 1,
      cancelled: 1,
      successRate: 0.5,
      successRateInclCancelled: 0.333,
    });
    expect(w['24h'].successRate).toBe(0.667);
  });

  it('names the job that finished last, skipping summary and ready jobs', () => {
    const sampled = [
      {
        run: run(1, 'success', 20),
        jobs: [
          job('ci-fast (remaining)', 19, 11),
          job('Unit Tests 1/14', 19, 13),
          job('PR Ready', 11, 10),
          job('lint', 19, 18, 'skipped'),
        ],
      },
      { run: run(2, 'failure', 20), jobs: [job('Unit Tests 1/14', 19, 2)] },
    ];
    const [first, second] = criticalPath(sampled);
    expect(first).toMatchObject({
      name: 'ci-fast (remaining)',
      p50: 480,
      lastShare: 1,
    });
    expect(second).toMatchObject({ name: 'Unit Tests 1/14', lastShare: 0 });
  });

  it('keeps a short job that ends runs even when it is not among the longest', () => {
    const sampled = [
      {
        run: run(1, 'success', 20),
        jobs: [job('long', 19, 12), job('smoke', 13, 10)],
      },
    ];
    expect(criticalPath(sampled, { top: 1 }).map(r => r.name)).toEqual([
      'long',
      'smoke',
    ]);
  });

  it('measures enqueue-to-merge from the last add before the merge', () => {
    expect(
      queueWaits([
        { mergedAt: at(0), enqueuedAt: [at(50), at(20), at(-5)] },
        { mergedAt: at(0), enqueuedAt: [] },
        { mergedAt: null, enqueuedAt: [at(5)] },
      ])
    ).toEqual([1200]);
  });

  it('summarizes the digest numbers and the batch-size gate', () => {
    const groupRuns = [
      run(1, 'success', 30, 12),
      run(2, 'success', 60, 10),
      run(3, 'failure', 300, 9),
    ];
    const summary = summarize({
      prRuns: [run(9, 'success', 100, 6)],
      groupRuns,
      sampledGroupJobs: [
        { run: groupRuns[0], jobs: [job('a', 30, 20)] },
        { run: groupRuns[1], jobs: [job('a', 60, 50)] },
        { run: groupRuns[2], jobs: [job('a', 300, 290)] },
      ],
      mergedPrs: [
        { mergedAt: at(10), enqueuedAt: [at(40)] },
        { mergedAt: at(2000), enqueuedAt: [at(2010)] },
      ],
      now: NOW,
    });
    expect(summary).toMatchObject({
      merges: 1,
      mergesPerHour: 0.04,
      groupSuccessRate: 0.667,
      mergeGroupCiSeconds: { n: 2, p50: 720 },
      prCiSeconds: { n: 1, p50: 360 },
      queueWaitSeconds: { n: 2, p50: 1800 },
      mergeGroupRunnerMinutesPerMerge: 30,
      batchSizeGate: { success2h: 1, eligible: true },
    });
    expect(digestBlock(summary)).toEqual({
      mergesPerHour: 0.04,
      groupSuccessRate: 0.667,
      groupSuccessRate2h: 1,
      mergeGroupP50Seconds: 720,
      queueWaitP50Seconds: 1800,
      generatedAt: summary.generatedAt,
    });
    expect(digestBlock(null)).toBeNull();
  });

  it('reports nulls instead of zeros when nothing was sampled', () => {
    const summary = summarize({ now: NOW });
    expect(summary.groupSuccessRate).toBeNull();
    expect(summary.mergeGroupRunnerMinutesPerMerge).toBeNull();
    expect(summary.batchSizeGate.eligible).toBe(false);
  });
});
