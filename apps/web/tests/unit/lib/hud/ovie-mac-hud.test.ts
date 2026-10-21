import { describe, expect, it } from 'vitest';
import {
  classifyOvieMacHudPullRequest,
  composeOvieMacHudInFlightPullRequests,
  composeOvieMacHudSnapshot,
  computeDefaultAlive,
  computeWowGrowth,
  emptyOvieMacHudInFlightPullRequests,
  gradeYcGrowth,
  monthlyToWeeklyUsd,
  OVIE_MAC_HUD_IN_FLIGHT_PR_LIMIT,
  shippingFromMerges,
  weeklyGrowthFromPeriodRate,
  windowToWeeklyUsd,
  YC_EXCEPTIONAL_GROWTH,
  YC_GOOD_GROWTH_MIN,
  ycBarLabel,
} from '@/lib/hud/ovie-mac-hud';
import type { LybDailyMrr } from '@/lib/ovie/lyb-mrr';

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
    headRefName: `devin/jov-${number}-20260822t000000`,
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

  it('reports shipping throughput from org merge counts, n/a when unmeasured', () => {
    expect(shippingFromMerges({ last7Days: 862, today: 292 })).toEqual({
      shipsThisWeek: 862,
      available: true,
      detail:
        'PRs merged across JovieInc in the last 7 days. 292 since midnight PT.',
    });
    expect(shippingFromMerges({ last7Days: 862, today: null }).detail).toBe(
      'PRs merged across JovieInc in the last 7 days.'
    );
    expect(shippingFromMerges(null)).toEqual({
      shipsThisWeek: 0,
      available: false,
      detail: 'GitHub merge counts unavailable.',
    });
    expect(shippingFromMerges({ last7Days: null, today: 3 }).available).toBe(
      false
    );
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
    expect(
      classifyOvieMacHudPullRequest({
        isDraft: false,
        reviewDecision: null,
        mergeable: 'MERGEABLE',
        labels: ['needs-human', 'no-auto'],
        reviewRequestCount: 0,
        mergeQueuePosition: null,
      })
    ).toBe('open');
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
          title: 'Blocked by machine hold',
          updatedAt: '2026-08-19T00:00:00.000Z',
          labels: { nodes: [{ name: 'hold' }] },
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

  it('keeps lane and queued PRs in flight and leaves dependabot out', () => {
    const result = composeOvieMacHudInFlightPullRequests({
      totalOpen: 150,
      pullRequests: [
        prNode({
          number: 18856,
          headRefName: 'dependabot/npm_and_yarn/next-16.2.1',
          mergeable: 'CONFLICTING',
        }),
        prNode({ number: 18857, headRefName: 'tim/manual-fix' }),
        prNode({
          number: 18921,
          headRefName: 'codex/jov-2905-20260927t040433',
        }),
        prNode({
          number: 18917,
          headRefName: 'devin/jov-5905-20260927t034623',
        }),
      ],
      mergeQueueEntries: [
        {
          position: 1,
          state: 'AWAITING_CHECKS',
          pullRequest: prNode({
            number: 18868,
            headRefName: 'feat/queued-human',
          }),
        },
      ],
    });

    expect(result.items.map(pr => pr.number).sort()).toEqual([
      18868, 18917, 18921,
    ]);
    expect(result.totalOpen).toBe(3);
    expect(result.items[0]).toMatchObject({
      number: 18868,
      status: 'merge_queue',
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
      shipping: shippingFromMerges(null),
      generatedAtIso: '2026-08-22T00:00:00.000Z',
    });

    expect(snapshot.inFlightPullRequests).toMatchObject({
      availability: 'not_configured',
      items: [],
      totalOpen: 0,
    });
  });
});

const alive = (
  cashUsd: number | null,
  weeklyBurnUsd: number | null,
  weeklyRevenueUsd: number | null,
  weeklyRevenueGrowthRate: number | null = 0,
  available = true
) =>
  computeDefaultAlive({
    cashUsd,
    weeklyBurnUsd,
    weeklyRevenueUsd,
    weeklyRevenueGrowthRate,
    available,
  });

const classify = (
  over: Partial<Parameters<typeof classifyOvieMacHudPullRequest>[0]> = {}
) =>
  classifyOvieMacHudPullRequest({
    isDraft: false,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    labels: [],
    reviewRequestCount: 0,
    mergeQueuePosition: null,
    ...over,
  });

const compose = (
  pullRequests: unknown[],
  mergeQueueEntries: unknown[] = [],
  extra: { totalOpen?: number; sourceTruncated?: boolean; limit?: number } = {}
) =>
  composeOvieMacHudInFlightPullRequests({
    totalOpen: extra.totalOpen ?? pullRequests.length,
    pullRequests,
    mergeQueueEntries,
    sourceTruncated: extra.sourceTruncated,
    limit: extra.limit,
  });

describe('computeDefaultAlive', () => {
  it('returns unknown and hides numbers when the source is unavailable', () => {
    expect(alive(100, 50, 80, 0.1, false)).toEqual({
      cashUsd: null,
      weeklyBurnUsd: null,
      weeklyRevenueUsd: null,
      weeklyRevenueGrowthRate: 0.1,
      available: false,
      status: 'unknown',
      reachesProfitBeforeZero: null,
      detail: 'Alive numbers unavailable.',
    });
  });

  it.each([
    [null, 50, 80],
    [100, null, 80],
    [100, 50, null],
  ])(
    'returns unknown when cash=%s burn=%s revenue=%s is missing',
    (c, b, r) => {
      expect(alive(c, b, r)).toMatchObject({
        status: 'unknown',
        reachesProfitBeforeZero: null,
      });
    }
  );

  it('calls zero revenue with burn default dead', () => {
    expect(alive(10_000, 500, 0, 0.5)).toEqual({
      cashUsd: 10_000,
      weeklyBurnUsd: 500,
      weeklyRevenueUsd: 0,
      weeklyRevenueGrowthRate: 0.5,
      available: true,
      status: 'dead',
      reachesProfitBeforeZero: false,
      detail: '$0 revenue with burn is default dead.',
    });
  });

  it.each([
    [80, 50],
    [50, 50],
    [0, 0],
  ])('is alive when revenue %i covers burn %i', (revenue, burn) => {
    expect(alive(100, burn, revenue)).toMatchObject({
      status: 'alive',
      reachesProfitBeforeZero: true,
      detail: 'Revenue already covers burn.',
    });
  });

  it('is alive when growth reaches profit exactly as cash runs out', () => {
    // Doubling weekly: revenue 100 → 200 in one week; net burn 100/week.
    expect(alive(100, 200, 100, 1)).toMatchObject({
      status: 'alive',
      reachesProfitBeforeZero: true,
      detail: 'Current burn and growth reach profit before cash hits zero.',
    });
    expect(alive(99, 200, 100, 1)).toMatchObject({
      status: 'dead',
      reachesProfitBeforeZero: false,
      detail: 'Burn and growth do not reach profit before cash hits zero.',
    });
  });

  it.each([
    ['no growth', 1_000_000, 0],
    ['unknown growth', 1_000_000, null],
    ['shrinking revenue', 1_000_000, -0.1],
    ['no cash', 0, 1],
    ['negative cash', -10, 1],
  ])('is dead with %s', (_label, cash, growth) => {
    expect(alive(cash, 200, 100, growth)).toMatchObject({
      status: 'dead',
      reachesProfitBeforeZero: false,
    });
  });
});

describe('growth helpers', () => {
  it('converts monthly and windowed amounts to weekly', () => {
    expect(monthlyToWeeklyUsd(5200)).toBe(1200);
    expect(windowToWeeklyUsd(300, 30)).toBe(70);
    expect(windowToWeeklyUsd(300, 0)).toBe(0);
    expect(windowToWeeklyUsd(300, -7)).toBe(0);
  });

  it('compounds a period growth rate down to a weekly rate', () => {
    expect(weeklyGrowthFromPeriodRate(0.21, 14)).toBeCloseTo(0.1, 12);
    expect(weeklyGrowthFromPeriodRate(0.1, 7)).toBeCloseTo(0.1, 12);
    expect(weeklyGrowthFromPeriodRate(0.5, 0)).toBe(0);
    expect(weeklyGrowthFromPeriodRate(0.5, -1)).toBe(0);
  });

  it('grades growth against the YC weekly bars', () => {
    expect(YC_EXCEPTIONAL_GROWTH).toBe(0.1);
    expect(YC_GOOD_GROWTH_MIN).toBe(0.05);
    expect(gradeYcGrowth(0.1)).toBe('exceptional');
    expect(gradeYcGrowth(0.0999)).toBe('good');
    expect(gradeYcGrowth(0.05)).toBe('good');
    expect(gradeYcGrowth(0.0499)).toBe('not-figured-out');
    expect(gradeYcGrowth(-0.2)).toBe('not-figured-out');
  });

  it('labels each YC bar', () => {
    expect(ycBarLabel('exceptional')).toBe('10% exceptional');
    expect(ycBarLabel('good')).toBe('5–7%/week good');
    expect(ycBarLabel('not-figured-out')).toBe('1% means not figured out');
  });
});

describe('computeWowGrowth', () => {
  it('measures revenue week over week', () => {
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 106,
        lastWeekRevenueUsd: 100,
        thisWeekActiveUsers: 1,
        lastWeekActiveUsers: 2,
      })
    ).toEqual({
      rate: expect.closeTo(0.06, 10),
      source: 'revenue',
      ycBar: 'good',
      thisWeek: 106,
      lastWeek: 100,
      available: true,
      showChart: false,
    });
  });

  it('uses revenue when only one week has revenue', () => {
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 0,
        lastWeekRevenueUsd: 50,
        thisWeekActiveUsers: 10,
        lastWeekActiveUsers: 5,
      })
    ).toMatchObject({ source: 'revenue', rate: -1, thisWeek: 0, lastWeek: 50 });
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 50,
        lastWeekRevenueUsd: 0,
        thisWeekActiveUsers: 10,
        lastWeekActiveUsers: 5,
      })
    ).toMatchObject({ source: 'revenue', rate: 0, ycBar: 'not-figured-out' });
  });

  it('falls back to active users when revenue is missing', () => {
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: null,
        lastWeekRevenueUsd: 100,
        thisWeekActiveUsers: 120,
        lastWeekActiveUsers: 100,
      })
    ).toEqual({
      rate: expect.closeTo(0.2, 10),
      source: 'active-users',
      ycBar: 'exceptional',
      thisWeek: 120,
      lastWeek: 100,
      available: true,
      showChart: false,
    });
  });

  it('reports unavailable growth when no series is measured', () => {
    expect(
      computeWowGrowth({
        thisWeekRevenueUsd: 10,
        lastWeekRevenueUsd: null,
        thisWeekActiveUsers: 10,
        lastWeekActiveUsers: null,
      })
    ).toEqual({
      rate: 0,
      source: 'active-users',
      ycBar: 'not-figured-out',
      thisWeek: 0,
      lastWeek: 0,
      available: false,
      showChart: false,
    });
  });
});

describe('shippingFromMerges', () => {
  it('formats today’s merge count, including zero', () => {
    expect(shippingFromMerges({ last7Days: 0, today: 0 })).toEqual({
      shipsThisWeek: 0,
      available: true,
      detail:
        'PRs merged across JovieInc in the last 7 days. 0 since midnight PT.',
    });
    expect(shippingFromMerges({ last7Days: 5000, today: 1234 }).detail).toBe(
      'PRs merged across JovieInc in the last 7 days. 1,234 since midnight PT.'
    );
  });
});

describe('classifyOvieMacHudPullRequest', () => {
  it.each(['blocked', 'do-not-merge', 'do not merge', 'gated', 'hold', 'HOLD'])(
    'treats the %s label as blocking',
    label => {
      expect(classify({ labels: ['area/web', label] })).toBe('blocked');
    }
  );

  it.each([
    [{ mergeable: 'CONFLICTING' }, 'blocked'],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'blocked'],
    [{ reviewDecision: 'REVIEW_REQUIRED' }, 'in_review'],
    [{ reviewDecision: 'APPROVED' }, 'in_review'],
    [{ reviewRequestCount: 2 }, 'in_review'],
    [{ mergeQueuePosition: 0 }, 'merge_queue'],
    [{ mergeQueuePosition: 0, isDraft: true }, 'merge_queue'],
    [{}, 'open'],
  ] as const)('%j → %s', (over, status) => {
    expect(classify(over)).toBe(status);
  });
});

describe('composeOvieMacHudInFlightPullRequests', () => {
  it('normalizes a lane PR into the full in-flight shape', () => {
    const result = compose([
      prNode({
        number: 7,
        title: '  Fix ledger  ',
        url: ' https://github.com/JovieInc/Jovie/pull/7 ',
        headRefName: 'codex/jov-7',
        updatedAt: '2026-08-22T01:02:03Z',
        reviewDecision: 'APPROVED',
        author: { login: 'devin-ai' },
      }),
    ]);
    expect(result).toEqual({
      availability: 'available',
      totalOpen: 1,
      items: [
        {
          number: 7,
          title: 'Fix ledger',
          url: 'https://github.com/JovieInc/Jovie/pull/7',
          headRefName: 'codex/jov-7',
          authorLogin: 'devin-ai',
          updatedAtIso: '2026-08-22T01:02:03.000Z',
          status: 'in_review',
          statusLabel: 'In Review',
          statusDetail: 'Approved',
          mergeQueuePosition: null,
        },
      ],
      truncated: false,
      errorMessage: null,
    });
  });

  it.each([
    [{ labels: { nodes: [{ name: 'gated' }] } }, 'Blocked', 'Blocking label'],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'Blocked', 'Changes requested'],
    [{ mergeable: 'CONFLICTING' }, 'Blocked', 'Merge conflict'],
    [{ reviewRequests: { totalCount: 1 } }, 'In Review', 'Review requested'],
    [{ reviewDecision: 'REVIEW_REQUIRED' }, 'In Review', 'Review required'],
    [{ isDraft: true }, 'Open', 'Draft'],
    [{}, 'Open', 'Ready'],
  ] satisfies ReadonlyArray<
    readonly [Parameters<typeof prNode>[0], string, string]
  >)('%j → %s / %s', (over, statusLabel, statusDetail) => {
    expect(compose([prNode(over)]).items[0]).toMatchObject({
      statusLabel,
      statusDetail,
    });
  });

  it('drops malformed pull request nodes', () => {
    const result = compose([
      null,
      'pr',
      prNode({ number: 0 }),
      { ...prNode({ number: 2 }), number: 2.5 },
      prNode({ number: 3, title: '   ' }),
      prNode({ number: 4, url: '' }),
      prNode({ number: 5, updatedAt: 'not a date' }),
      { ...prNode({ number: 6 }), updatedAt: undefined },
      prNode({ number: 9 }),
    ]);
    expect(result.items.map(pr => pr.number)).toEqual([9]);
  });

  it('tolerates missing optional fields', () => {
    const node = {
      number: 8,
      title: 'Queued human PR',
      url: 'https://github.com/JovieInc/Jovie/pull/8',
      updatedAt: '2026-08-22T00:00:00.000Z',
      labels: { nodes: ['bad', { name: '' }, { name: ' hold ' }] },
      reviewRequests: { totalCount: -1 },
    };
    const [item] = compose([node], [{ position: 2, pullRequest: node }]).items;
    expect(item).toMatchObject({
      headRefName: 'unknown',
      authorLogin: null,
      status: 'merge_queue',
      statusDetail: 'Position 2',
    });
    // The trimmed "hold" label still blocks once the PR leaves the queue.
    expect(
      compose([{ ...node, headRefName: 'devin/x' }]).items[0]
    ).toMatchObject({ status: 'blocked', statusDetail: 'Blocking label' });
    expect(
      compose([{ ...node, headRefName: 'devin/x', labels: null }]).items[0]
    ).toMatchObject({ status: 'open', statusDetail: 'Ready' });
  });

  it('ignores malformed merge queue entries', () => {
    const result = compose(
      [prNode({ number: 1 }), prNode({ number: 2 })],
      [
        null,
        { position: 1 },
        { position: -1, pullRequest: { number: 1 } },
        { position: 1.5, pullRequest: { number: 2 } },
        { position: 3, pullRequest: { number: 0 } },
      ]
    );
    expect(result.items.map(pr => pr.status)).toEqual(['open', 'open']);
  });

  it('prefers the open-PR node over the queue copy for the same number', () => {
    const result = compose(
      [prNode({ number: 5, title: 'From open list' })],
      [{ position: 0, pullRequest: prNode({ number: 5, title: 'From queue' }) }]
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'From open list',
      status: 'merge_queue',
    });
  });

  it('orders queue entries by position and others by most recent update', () => {
    const result = compose(
      [
        prNode({ number: 1, updatedAt: '2026-08-01T00:00:00.000Z' }),
        prNode({ number: 2, updatedAt: '2026-08-03T00:00:00.000Z' }),
        prNode({ number: 3, updatedAt: '2026-08-02T00:00:00.000Z' }),
      ],
      [
        { position: 2, pullRequest: prNode({ number: 10 }) },
        { position: 1, pullRequest: prNode({ number: 11 }) },
      ]
    );
    expect(result.items.map(pr => pr.number)).toEqual([11, 10, 2, 3, 1]);
  });

  it('caps the list at the default limit and reports the full in-flight count', () => {
    expect(OVIE_MAC_HUD_IN_FLIGHT_PR_LIMIT).toBe(8);
    const nodes = Array.from({ length: 9 }, (_, i) =>
      prNode({ number: i + 1 })
    );
    const result = compose(nodes, [], { totalOpen: 3 });
    expect(result.items).toHaveLength(8);
    expect(result.totalOpen).toBe(9);
    expect(result.truncated).toBe(true);
    const exact = compose(nodes.slice(0, 8));
    expect(exact.items).toHaveLength(8);
    expect(exact.truncated).toBe(false);
  });

  it('keeps the larger of the reported and seen totals for a truncated source', () => {
    const nodes = [prNode({ number: 1 }), prNode({ number: 2 })];
    expect(
      compose(nodes, [], { totalOpen: 1, sourceTruncated: true })
    ).toMatchObject({ totalOpen: 2, truncated: true });
    expect(
      compose(nodes, [], { totalOpen: 50, sourceTruncated: true })
    ).toMatchObject({ totalOpen: 50, truncated: true });
    expect(compose(nodes, [], { totalOpen: 50 })).toMatchObject({
      totalOpen: 2,
      truncated: false,
    });
  });

  it('builds empty signals for unconfigured or failed sources', () => {
    expect(emptyOvieMacHudInFlightPullRequests('error', 'GitHub 502')).toEqual({
      availability: 'error',
      totalOpen: 0,
      items: [],
      truncated: false,
      errorMessage: 'GitHub 502',
    });
    expect(
      emptyOvieMacHudInFlightPullRequests('not_configured').errorMessage
    ).toBeNull();
  });
});

describe('composeOvieMacHudSnapshot', () => {
  const base = {
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
    shipping: shippingFromMerges({ last7Days: 12, today: 1 }),
    generatedAtIso: '2026-08-22T00:00:00.000Z',
  };

  it('composes every section and omits optional ones that were not provided', () => {
    const snapshot = composeOvieMacHudSnapshot(base);
    expect(snapshot).toEqual({
      alive: computeDefaultAlive(base.alive),
      growth: computeWowGrowth(base.growth),
      shipping: base.shipping,
      inFlightPullRequests:
        emptyOvieMacHudInFlightPullRequests('not_configured'),
      generatedAtIso: '2026-08-22T00:00:00.000Z',
    });
    expect('lybMrr' in snapshot).toBe(false);
    expect('decisionHud' in snapshot).toBe(false);
  });

  it('passes through provided in-flight PRs and LYB MRR', () => {
    const inFlightPullRequests = compose([prNode({ number: 1 })]);
    const lybMrr = { product: 'logyourbody' } as unknown as LybDailyMrr;
    const snapshot = composeOvieMacHudSnapshot({
      ...base,
      inFlightPullRequests,
      lybMrr,
    });
    expect(snapshot.inFlightPullRequests).toBe(inFlightPullRequests);
    expect(snapshot.lybMrr).toBe(lybMrr);
  });

  it('adds the decision view when decision extras are supplied', () => {
    const snapshot = composeOvieMacHudSnapshot({ ...base, decisionExtras: {} });
    expect(snapshot.decisionHud).toBeDefined();
  });
});
