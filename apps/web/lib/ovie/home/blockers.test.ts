import { describe, expect, it } from 'vitest';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { blockerReason, buildInFlightSummary } from './blockers';

type Task = ShippingCockpitProjection['operationalTasks']['tasks'][number];

function task(
  n: number,
  workflowState: Task['workflowState'],
  failing: string[] = [],
  rollup: 'success' | 'failure' | 'pending' | 'unknown' = failing.length
    ? 'failure'
    : 'success'
): Task {
  return {
    id: `linear:JOV-${n}`,
    linearIdentifier: `JOV-${n}`,
    linearUrl: null,
    title: `Task ${n}`,
    workflowState,
    priority: 'none',
    attempt: null,
    retryAt: null,
    sourceRevision: null,
    updatedAt: null,
    pullRequest: {
      number: 100 + n,
      url: `https://github.com/JovieInc/Jovie/pull/${100 + n}`,
      branch: null,
      agent: null,
      isDraft: false,
      checks: { rollup, failing },
      queuePosition: null,
      queueState: null,
      createdAt: null,
    },
  };
}

describe('blockerReason', () => {
  it('collapses shards and per-run ids into one readable reason', () => {
    expect(blockerReason('Affected Unit Tests (3/4)')).toBe(
      'Unit tests failing'
    );
    expect(blockerReason('jovie-execution/e502e4ea63abb5bc')).toBe(
      'Agent run failed'
    );
    expect(blockerReason('Source Validation')).toBe(
      'Source validation failing'
    );
    expect(blockerReason('Some New Check')).toBe('Some New Check');
  });
});

describe('buildInFlightSummary', () => {
  it('groups stuck work by reason, most PRs first, and counts moving work once', () => {
    const summary = buildInFlightSummary([
      task(1, 'blocked', ['Source Validation', 'Source Validation']),
      task(2, 'in-review', ['Source Validation', 'Fleet Rules Evidence']),
      task(3, 'running', [
        'Affected Unit Tests (1/4)',
        'Affected Unit Tests (2/4)',
      ]),
      task(4, 'running'),
      task(5, 'in-review'),
      task(6, 'blocked', [], 'pending'),
      task(7, 'production-verified'),
    ]);
    expect(summary).toMatchObject({ total: 6, stuck: 4, moving: 2 });
    // One group per PR: the groups always sum to the stuck count.
    expect(summary.groups.map(g => [g.reason, g.count])).toEqual([
      ['Source validation failing', 2],
      ['Blocked in Linear, checks pending', 1],
      ['Unit tests failing', 1],
    ]);
    expect(summary.groups.reduce((n, g) => n + g.count, 0)).toBe(summary.stuck);
    expect(summary.movingPrs.map(pr => pr.id)).toEqual([
      'linear:JOV-4',
      'linear:JOV-5',
    ]);
    expect(summary.groups[0]?.prs[0]).toEqual({
      id: 'linear:JOV-1',
      label: '#101 Task 1',
      url: 'https://github.com/JovieInc/Jovie/pull/101',
    });
  });
});

describe('buildInFlightSummary overflow', () => {
  it('folds reasons past the limit into Other reasons', () => {
    const summary = buildInFlightSummary(
      ['A', 'B', 'C'].map((check, i) => task(i + 1, 'blocked', [check])),
      2
    );
    expect(summary.groups.map(g => [g.reason, g.count])).toEqual([
      ['A', 1],
      ['B', 1],
      ['Other reasons (1)', 1],
    ]);
  });
});
