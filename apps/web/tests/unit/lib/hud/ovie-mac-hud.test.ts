import { describe, expect, it } from 'vitest';
import {
  classifyOvieMacHudPullRequest,
  composeOvieMacHudInFlightPullRequests,
  composeOvieMacHudSnapshot,
  computeDefaultAlive,
  computeWowGrowth,
  countReceiptedShipsThisWeek,
  gradeYcGrowth,
  monthlyToWeeklyUsd,
  parseReceiptedShip,
  windowToWeeklyUsd,
} from '@/lib/hud/ovie-mac-hud';

const RECEIPTED = {
  issueNumber: 5298,
  symphonyRef: 'symphony-task-1',
  mergeQueueRef: 'MQ-1',
  prodSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  receiptAt: '2026-08-20T12:00:00.000Z',
};

function prNode(
  overrides: Partial<{
    number: number;
    title: string;
    url: string;
    headRefName: string;
    updatedAt: string;
    isDraft: boolean;
    reviewDecision: string | null;
    mergeable: string | null;
    author: { login: string };
    labels: { nodes: Array<{ name: string }> };
    reviewRequests: { totalCount: number };
  }> = {}
) {
  const number = overrides.number ?? 100;
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/JovieInc/Jovie/pull/${number}`,
    headRefName: `tim/jov-${number}`,
    updatedAt: '2026-08-22T00:00:00.000Z',
    isDraft: false,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    author: { login: 'itstimwhite' },
    labels: { nodes: [] },
    reviewRequests: { totalCount: 0 },
    ...overrides,
  };
}

function aliveStatus(
  cashUsd: number,
  weeklyBurnUsd: number,
  weeklyRevenueUsd: number,
  weeklyRevenueGrowthRate: number | null = 0,
  available = true
) {
  return computeDefaultAlive({
    cashUsd,
    weeklyBurnUsd,
    weeklyRevenueUsd,
    weeklyRevenueGrowthRate,
    available,
  }).status;
}

describe('Ovie Mac HUD derivation', () => {
  it('decides default alive/dead from cash, burn, revenue, and growth', () => {
    expect(aliveStatus(10_000, 500, 0, 0.2)).toBe('dead');
    expect(aliveStatus(100, 50, 80)).toBe('alive');
    expect(aliveStatus(10_000, 200, 100, 0.2)).toBe('alive');
    expect(aliveStatus(100, 200, 50, 0.01)).toBe('dead');
    expect(aliveStatus(0, 0, 0, null, false)).toBe('unknown');
  });

  it('prefers revenue WoW, falls back to users, and never charts 0%', () => {
    const revenue = computeWowGrowth({
      thisWeekRevenueUsd: 110,
      lastWeekRevenueUsd: 100,
      thisWeekActiveUsers: 1,
      lastWeekActiveUsers: 1,
    });
    expect(revenue).toMatchObject({
      source: 'revenue',
      ycBar: 'exceptional',
      showChart: false,
    });
    expect(revenue.rate).toBeCloseTo(0.1);
    expect(gradeYcGrowth(0.06)).toBe('good');
    expect(gradeYcGrowth(0.01)).toBe('not-figured-out');
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 0,
        lastWeekRevenueUsd: 0,
        thisWeekActiveUsers: 0,
        lastWeekActiveUsers: 0,
      })
    ).toMatchObject({ source: 'active-users', rate: 0, showChart: false });
  });

  it('counts only receipted ships this week', () => {
    const now = Date.parse('2026-08-22T00:00:00.000Z');
    expect(
      parseReceiptedShip({ issueNumber: 1, mergedAt: RECEIPTED.receiptAt })
    ).toBeNull();
    const shipping = countReceiptedShipsThisWeek(
      [
        {
          title: 'Merged without receipt',
          mergedAt: '2026-08-21T00:00:00.000Z',
        },
        RECEIPTED,
        { ...RECEIPTED, receiptAt: '2026-08-01T00:00:00.000Z', issueNumber: 2 },
      ],
      now
    );
    expect(shipping.shipsThisWeek).toBe(1);
    expect(monthlyToWeeklyUsd(5200)).toBe(1200);
    expect(windowToWeeklyUsd(300, 30)).toBe(70);
  });

  it('classifies in-flight PRs from live GitHub and MQ fields', () => {
    expect(
      classifyOvieMacHudPullRequest({
        isDraft: true,
        reviewDecision: 'CHANGES_REQUESTED',
        mergeable: 'CONFLICTING',
        labels: ['hold'],
        reviewRequestCount: 0,
        mergeQueuePosition: null,
      })
    ).toBe('open');
    expect(
      classifyOvieMacHudPullRequest({
        isDraft: false,
        reviewDecision: 'REVIEW_REQUIRED',
        mergeable: 'MERGEABLE',
        labels: [],
        reviewRequestCount: 1,
        mergeQueuePosition: null,
      })
    ).toBe('in_review');
    expect(
      classifyOvieMacHudPullRequest({
        isDraft: false,
        reviewDecision: 'CHANGES_REQUESTED',
        mergeable: 'MERGEABLE',
        labels: [],
        reviewRequestCount: 0,
        mergeQueuePosition: null,
      })
    ).toBe('blocked');
    expect(
      classifyOvieMacHudPullRequest({
        isDraft: false,
        reviewDecision: 'APPROVED',
        mergeable: 'MERGEABLE',
        labels: [],
        reviewRequestCount: 0,
        mergeQueuePosition: 1,
      })
    ).toBe('merge_queue');
  });

  it('composes and sorts the in-flight PR list by current status', () => {
    const result = composeOvieMacHudInFlightPullRequests({
      totalOpen: 4,
      pullRequests: [
        prNode({
          number: 11,
          title: 'Needs review',
          updatedAt: '2026-08-21T00:00:00.000Z',
          reviewDecision: 'APPROVED',
          reviewRequests: { totalCount: 1 },
        }),
        prNode({
          number: 12,
          title: 'Draftable open work',
          updatedAt: '2026-08-20T00:00:00.000Z',
          isDraft: true,
          labels: { nodes: [{ name: 'hold' }] },
        }),
        prNode({
          number: 13,
          title: 'Blocked by human taste',
          updatedAt: '2026-08-19T00:00:00.000Z',
          labels: { nodes: [{ name: 'human-review-required' }] },
        }),
      ],
      mergeQueueEntries: [
        {
          position: 1,
          state: 'AWAITING_CHECKS',
          pullRequest: prNode({
            number: 14,
            title: 'Queued for merge',
            updatedAt: '2026-08-18T00:00:00.000Z',
            reviewDecision: 'APPROVED',
          }),
        },
      ],
    });

    expect(result.availability).toBe('available');
    expect(result.totalOpen).toBe(4);
    expect(result.items.map(pr => pr.number)).toEqual([14, 13, 11, 12]);
    expect(result.items.map(pr => pr.status)).toEqual([
      'merge_queue',
      'blocked',
      'in_review',
      'open',
    ]);
    expect(result.items[0]).toMatchObject({
      statusLabel: 'MQ',
      statusDetail: 'Position 1',
      mergeQueuePosition: 1,
    });
    expect(result.items[2]).toMatchObject({
      number: 11,
      statusDetail: 'Review requested',
    });
    expect(result.items[3]).toMatchObject({
      number: 12,
      status: 'open',
      statusDetail: 'Draft',
    });
  });

  it('marks the in-flight PR list truncated when source or display is capped', () => {
    const result = composeOvieMacHudInFlightPullRequests({
      totalOpen: 115,
      sourceTruncated: true,
      limit: 1,
      pullRequests: [prNode({ number: 21 }), prNode({ number: 22 })],
      mergeQueueEntries: [],
    });

    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('does not mark the list truncated for dropped malformed rows', () => {
    const result = composeOvieMacHudInFlightPullRequests({
      totalOpen: 2,
      limit: 8,
      pullRequests: [prNode({ number: 31 }), { number: 'not-valid' }],
      mergeQueueEntries: [],
    });

    expect(result.items).toHaveLength(1);
    expect(result.totalOpen).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('keeps zero-position merge queue entries classified as MQ', () => {
    const result = composeOvieMacHudInFlightPullRequests({
      totalOpen: 1,
      pullRequests: [prNode({ number: 32 })],
      mergeQueueEntries: [
        {
          position: 0,
          state: 'AWAITING_CHECKS',
          pullRequest: prNode({ number: 32 }),
        },
      ],
    });

    expect(result.items[0]).toMatchObject({
      number: 32,
      status: 'merge_queue',
      mergeQueuePosition: 0,
      statusDetail: 'Position 0',
    });
  });

  it('defaults snapshots to an unconfigured in-flight PR signal', () => {
    const snapshot = composeOvieMacHudSnapshot({
      alive: {
        cashUsd: 10_000,
        weeklyBurnUsd: 500,
        weeklyRevenueUsd: 600,
        weeklyRevenueGrowthRate: 0,
        available: true,
      },
      growth: {
        thisWeekRevenueUsd: 600,
        lastWeekRevenueUsd: 500,
        thisWeekActiveUsers: null,
        lastWeekActiveUsers: null,
      },
      shippingEntries: [],
      generatedAtIso: '2026-08-22T00:00:00.000Z',
    });

    expect(snapshot.inFlightPullRequests).toMatchObject({
      availability: 'not_configured',
      items: [],
      totalOpen: 0,
    });
  });
});
