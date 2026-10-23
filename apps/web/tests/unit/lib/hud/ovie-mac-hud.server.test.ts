import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { captureError } from '@/lib/error-tracking';
import { getLybDailyMrr } from '@/lib/ovie/lyb-mrr.server';

const mockEnv = vi.hoisted(() => ({
  HUD_GITHUB_TOKEN: undefined as string | undefined,
  HUD_GITHUB_OWNER: undefined as string | undefined,
  HUD_GITHUB_REPO: undefined as string | undefined,
}));

const mockServerFetch = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

const mockReadMerges = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  readConfiguredMerges: mockReadMerges,
}));

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: vi.fn(),
}));

vi.mock('@/lib/admin/mercury-metrics', () => ({
  getAdminMercuryMetrics: vi.fn(),
}));

vi.mock('@/lib/ovie/lyb-mrr.server', () => ({
  getLybDailyMrr: vi.fn(),
}));

vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: vi.fn().mockResolvedValue(null),
}));

function stripeAvailable() {
  return {
    mrrUsd: 5200,
    activeSubscribers: 10,
    mrrUsd30dAgo: 5000,
    mrrGrowth30dUsd: 200,
    isConfigured: true,
    isAvailable: true,
    excludedInternalSubscribers: 0,
    excludedInternalMrrUsd: 0,
  };
}

function mercuryAvailable(
  overrides: Partial<Awaited<ReturnType<typeof getAdminMercuryMetrics>>> = {}
) {
  return {
    balanceUsd: 10_000,
    burnRateUsd: 2000,
    burnWindowDays: 30,
    burnRateAvailable: true,
    isConfigured: true,
    isAvailable: true,
    defaultStatus: 'alive' as const,
    ...overrides,
  };
}

describe('getOvieMacHudSnapshot', () => {
  beforeEach(() => {
    mockEnv.HUD_GITHUB_TOKEN = undefined;
    mockEnv.HUD_GITHUB_OWNER = undefined;
    mockEnv.HUD_GITHUB_REPO = undefined;
    mockServerFetch.mockReset();
    mockReadMerges.mockReset();
    mockReadMerges.mockResolvedValue({
      sourceId: 'github-merges',
      status: 'unavailable',
      errorCode: 'unavailable',
    });
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue(
      stripeAvailable()
    );
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(mercuryAvailable());
    vi.mocked(getLybDailyMrr).mockResolvedValue({
      schema: 'jovie.lyb-daily-mrr/v1',
      product: 'logyourbody',
      definition: 'active-paid-subscriptions-monthly-normalized-gross',
      currency: 'USD',
      asOfDate: null,
      observedAt: null,
      freshnessDeadline: null,
      source: null,
      state: 'unavailable',
      mrrCents: null,
    });
  });

  it('fails closed when Mercury burn telemetry is incomplete', async () => {
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(
      mercuryAvailable({
        burnRateUsd: 0,
        burnRateAvailable: false,
        defaultStatus: 'unknown',
        errorMessage: 'Mercury transaction window timed out.',
      })
    );

    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(snapshot.alive.available).toBe(false);
    expect(snapshot.alive.status).toBe('unknown');
    expect(snapshot.alive.weeklyBurnUsd).toBeNull();
    expect(snapshot.alive.cashUsd).toBeNull();
    expect(snapshot.inFlightPullRequests.availability).toBe('not_configured');
    expect(snapshot.lybMrr).toMatchObject({
      product: 'logyourbody',
      mrrCents: null,
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('fails closed when a Mercury producer omits burn completeness', async () => {
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue({
      balanceUsd: 10_000,
      burnRateUsd: 0,
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: true,
      defaultStatus: 'alive',
    } as never);

    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(snapshot.alive.available).toBe(false);
    expect(snapshot.alive.status).toBe('unknown');
  });

  it('fetches live GitHub and MQ truth for in-flight PRs', async () => {
    mockEnv.HUD_GITHUB_TOKEN = 'hud-token';
    mockEnv.HUD_GITHUB_OWNER = 'JovieInc';
    mockEnv.HUD_GITHUB_REPO = 'Jovie';
    mockServerFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                totalCount: 115,
                pageInfo: { hasNextPage: true },
                nodes: [
                  {
                    number: 16931,
                    title: 'draft HUD affordance',
                    url: 'https://github.com/JovieInc/Jovie/pull/16931',
                    headRefName: 'devin/jov-16931',
                    updatedAt: '2026-08-22T02:00:00.000Z',
                    isDraft: true,
                    reviewDecision: null,
                    mergeable: 'MERGEABLE',
                    author: { login: 'itstimwhite' },
                    labels: { nodes: [] },
                    reviewRequests: { totalCount: 0 },
                  },
                  {
                    number: 16927,
                    title: 'review HUD affordance',
                    url: 'https://github.com/JovieInc/Jovie/pull/16927',
                    headRefName: 'devin/jov-16927',
                    updatedAt: '2026-08-22T01:00:00.000Z',
                    isDraft: false,
                    reviewDecision: 'REVIEW_REQUIRED',
                    mergeable: 'MERGEABLE',
                    author: { login: 'codex' },
                    labels: { nodes: [] },
                    reviewRequests: { totalCount: 1 },
                  },
                ],
              },
              mergeQueue: {
                entries: {
                  pageInfo: { hasNextPage: false },
                  nodes: [
                    {
                      position: 1,
                      state: 'AWAITING_CHECKS',
                      pullRequest: {
                        number: 16886,
                        title: 'feat(eve): bind signed Summer shadow ingress',
                        url: 'https://github.com/JovieInc/Jovie/pull/16886',
                        headRefName: 'devin/jov-16886',
                        updatedAt: '2026-08-22T00:00:00.000Z',
                        isDraft: false,
                        reviewDecision: 'APPROVED',
                        mergeable: 'MERGEABLE',
                        author: { login: 'itstimwhite' },
                        labels: { nodes: [] },
                        reviewRequests: { totalCount: 0 },
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
        { status: 200 }
      )
    );

    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(mockServerFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockServerFetch.mock.calls[0] as [
      string,
      { body: string; cache: string; context: string },
    ];
    expect(url).toBe('https://api.github.com/graphql');
    const body = JSON.parse(init.body);
    expect(body.query).toContain('mergeQueue(branch: "main")');
    expect(body.variables).toEqual({ owner: 'JovieInc', name: 'Jovie' });
    expect(init.cache).toBe('no-store');
    expect(init.context).toBe('GitHub in-flight PRs for Ovie Mac HUD');

    expect(snapshot.inFlightPullRequests).toMatchObject({
      availability: 'available',
      totalOpen: 115,
      truncated: true,
    });
    expect(snapshot.inFlightPullRequests.items.map(pr => pr.number)).toEqual([
      16886, 16927, 16931,
    ]);
    expect(snapshot.inFlightPullRequests.items[0]).toMatchObject({
      status: 'merge_queue',
      statusLabel: 'MQ',
      statusDetail: 'Position 1',
      mergeQueuePosition: 1,
    });
  });

  it('reports shipping throughput from org merge counts, not local receipts', async () => {
    mockReadMerges.mockResolvedValue({
      sourceId: 'github-merges',
      status: 'ok',
      delivery: {
        merges: {
          today: { state: 'measured-nonzero', value: 292 },
          last7Days: { state: 'measured-nonzero', value: 862 },
        },
      },
    });
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(snapshot.shipping).toEqual({
      shipsThisWeek: 862,
      available: true,
      detail:
        'PRs merged across JovieInc in the last 7 days. 292 since midnight PT.',
    });

    mockReadMerges.mockResolvedValue({
      sourceId: 'github-merges',
      status: 'unavailable',
    });
    const degraded = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );
    expect(degraded.shipping.available).toBe(false);
  });

  it('keeps PR data from partial GraphQL responses without merge queue data', async () => {
    const { parseOvieMacHudInFlightPullRequestsResponse } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );

    const result = parseOvieMacHudInFlightPullRequestsResponse({
      data: {
        repository: {
          pullRequests: {
            totalCount: 1,
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                number: 16949,
                title: 'available PR data',
                url: 'https://github.com/JovieInc/Jovie/pull/16949',
                headRefName: 'devin/jov-16949',
                updatedAt: '2026-08-22T03:00:00.000Z',
                isDraft: false,
                reviewDecision: null,
                mergeable: 'MERGEABLE',
                author: { login: 'codex' },
                labels: { nodes: [] },
                reviewRequests: { totalCount: 0 },
              },
            ],
          },
          mergeQueue: null,
        },
      },
      errors: [{ message: 'mergeQueue is unavailable for this branch' }],
    });

    expect(result).toMatchObject({
      availability: 'available',
      totalOpen: 1,
      truncated: false,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      number: 16949,
      status: 'open',
    });
  });

  it('fails closed when the GitHub PR source errors', async () => {
    mockEnv.HUD_GITHUB_TOKEN = 'hud-token';
    mockEnv.HUD_GITHUB_OWNER = 'JovieInc';
    mockEnv.HUD_GITHUB_REPO = 'Jovie';
    mockServerFetch.mockResolvedValueOnce(new Response('{}', { status: 502 }));

    const { getOvieMacHudInFlightPullRequests } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );

    await expect(getOvieMacHudInFlightPullRequests()).resolves.toMatchObject({
      availability: 'error',
      errorMessage: 'GitHub API error (502)',
      items: [],
      totalOpen: 0,
    });
  });
});

const NOW = Date.parse('2026-08-22T00:00:00.000Z');

const lanePr = (number: number) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/JovieInc/Jovie/pull/${number}`,
  headRefName: `devin/jov-${number}`,
  updatedAt: '2026-08-22T00:00:00.000Z',
  isDraft: false,
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  author: { login: 'codex' },
  labels: { nodes: [] },
  reviewRequests: { totalCount: 0 },
});

const graphql = (
  pullRequests: Record<string, unknown>,
  mergeQueue: unknown = null,
  extra: Record<string, unknown> = {}
) => ({ data: { repository: { pullRequests, mergeQueue } }, ...extra });

describe('getOvieMacHudSnapshot — money and growth', () => {
  beforeEach(() => {
    vi.mocked(captureError).mockClear();
    mockEnv.HUD_GITHUB_TOKEN = undefined;
    mockEnv.HUD_GITHUB_OWNER = undefined;
    mockEnv.HUD_GITHUB_REPO = undefined;
    mockServerFetch.mockReset();
    mockReadMerges.mockReset();
    mockReadMerges.mockResolvedValue({
      sourceId: 'github-merges',
      status: 'unavailable',
    });
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue(
      stripeAvailable()
    );
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(mercuryAvailable());
    vi.mocked(getLybDailyMrr).mockResolvedValue(null as never);
    vi.mocked(getFounderFunnelData).mockResolvedValue(null as never);
  });

  it('derives weekly alive and growth inputs from Stripe MRR and Mercury burn', async () => {
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(NOW);
    const weeklyGrowth = (5200 / 5000) ** (7 / 30) - 1;
    expect(snapshot.generatedAtIso).toBe('2026-08-22T00:00:00.000Z');
    expect(snapshot.alive).toMatchObject({
      available: true,
      cashUsd: 10_000,
      weeklyRevenueUsd: 1200,
    });
    expect(snapshot.alive.weeklyBurnUsd).toBeCloseTo((2000 / 30) * 7, 10);
    expect(snapshot.alive.weeklyRevenueGrowthRate).toBeCloseTo(
      weeklyGrowth,
      12
    );
    expect(snapshot.growth).toMatchObject({
      source: 'revenue',
      thisWeek: 1200,
      available: true,
    });
    expect(snapshot.growth.lastWeek).toBeCloseTo((5000 * 12) / 52, 10);
    expect(getLybDailyMrr).toHaveBeenCalledWith(new Date(NOW));
    expect(getFounderFunnelData).toHaveBeenCalledWith('30d');
    expect(snapshot.decisionHud).toBeDefined();
  });

  it('reports no growth rate when MRR 30 days ago was zero', async () => {
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue({
      ...stripeAvailable(),
      mrrUsd30dAgo: 0,
    });
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(NOW);
    expect(snapshot.alive.weeklyRevenueGrowthRate).toBeNull();
    expect(snapshot.growth.lastWeek).toBe(0);
  });

  it.each([
    ['Stripe is unavailable', { isAvailable: false }, {}],
    ['Mercury is unavailable', {}, { isAvailable: false }],
  ])('hides every money input when %s', async (_label, stripe, mercury) => {
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue({
      ...stripeAvailable(),
      ...stripe,
    });
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(
      mercuryAvailable(mercury)
    );
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(NOW);
    expect(snapshot.alive).toMatchObject({
      available: false,
      status: 'unknown',
      cashUsd: null,
      weeklyBurnUsd: null,
      weeklyRevenueUsd: null,
      weeklyRevenueGrowthRate: null,
    });
    expect(snapshot.growth).toMatchObject({
      available: false,
      source: 'active-users',
    });
  });

  it('still builds the snapshot when the founder funnel fails', async () => {
    vi.mocked(getFounderFunnelData).mockRejectedValue(new Error('funnel down'));
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    await expect(getOvieMacHudSnapshot(NOW)).resolves.toMatchObject({
      generatedAtIso: '2026-08-22T00:00:00.000Z',
    });
  });

  it('treats an ok merge read without delivery data as unavailable', async () => {
    mockReadMerges.mockResolvedValue({
      sourceId: 'github-merges',
      status: 'ok',
    });
    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    expect((await getOvieMacHudSnapshot(NOW)).shipping.available).toBe(false);
  });
});

describe('getOvieMacHudInFlightPullRequests', () => {
  beforeEach(() => {
    vi.mocked(captureError).mockClear();
    mockServerFetch.mockReset();
    mockEnv.HUD_GITHUB_TOKEN = 'hud-token';
    mockEnv.HUD_GITHUB_OWNER = 'JovieInc';
    mockEnv.HUD_GITHUB_REPO = 'Jovie';
  });

  it.each(['HUD_GITHUB_TOKEN', 'HUD_GITHUB_OWNER', 'HUD_GITHUB_REPO'] as const)(
    'is not configured without %s',
    async key => {
      mockEnv[key] = undefined;
      const { getOvieMacHudInFlightPullRequests } = await import(
        '@/lib/hud/ovie-mac-hud.server'
      );
      await expect(getOvieMacHudInFlightPullRequests()).resolves.toEqual({
        availability: 'not_configured',
        totalOpen: 0,
        items: [],
        truncated: false,
        errorMessage: 'GitHub HUD source not configured.',
      });
      expect(mockServerFetch).not.toHaveBeenCalled();
    }
  );

  it('sends an authenticated, uncached GraphQL request with one retry', async () => {
    mockServerFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          graphql({
            totalCount: 0,
            pageInfo: { hasNextPage: false },
            nodes: [],
          })
        ),
        { status: 200 }
      )
    );
    const { getOvieMacHudInFlightPullRequests } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    await expect(getOvieMacHudInFlightPullRequests()).resolves.toMatchObject({
      availability: 'available',
      totalOpen: 0,
    });
    const [, init] = mockServerFetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer hud-token',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
      retry: { maxRetries: 1, baseDelayMs: 500 },
    });
    expect(JSON.parse(init.body as string).query).toContain('pullRequests(');
  });

  it('captures thrown errors and reports their message', async () => {
    const failure = new Error('socket hang up');
    mockServerFetch.mockRejectedValueOnce(failure);
    const { getOvieMacHudInFlightPullRequests } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    await expect(getOvieMacHudInFlightPullRequests()).resolves.toEqual({
      availability: 'error',
      totalOpen: 0,
      items: [],
      truncated: false,
      errorMessage: 'socket hang up',
    });
    expect(captureError).toHaveBeenCalledWith(
      'Ovie Mac HUD in-flight PRs failed',
      failure,
      { context: 'ovie_mac_hud_in_flight_prs' }
    );
  });

  it('uses a generic message for non-Error failures', async () => {
    mockServerFetch.mockRejectedValueOnce('boom');
    const { getOvieMacHudInFlightPullRequests } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    await expect(getOvieMacHudInFlightPullRequests()).resolves.toMatchObject({
      availability: 'error',
      errorMessage: 'GitHub in-flight PRs unavailable.',
    });
  });

  it('reports malformed payloads as errors', async () => {
    mockServerFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { repository: null } }), {
        status: 200,
      })
    );
    const { getOvieMacHudInFlightPullRequests } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    await expect(getOvieMacHudInFlightPullRequests()).resolves.toMatchObject({
      availability: 'error',
      errorMessage: 'GitHub in-flight PR response was malformed',
    });
  });
});

describe('parseOvieMacHudInFlightPullRequestsResponse', () => {
  const parse = async (payload: unknown) => {
    const { parseOvieMacHudInFlightPullRequestsResponse } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    return () => parseOvieMacHudInFlightPullRequestsResponse(payload);
  };
  const okPrs = {
    totalCount: 1,
    pageInfo: { hasNextPage: false },
    nodes: [lanePr(1)],
  };

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['errors without data', { errors: [{ message: 'rate limited' }] }],
  ])('rejects %s as unavailable', async (_label, payload) => {
    expect(await parse(payload)).toThrow(
      'GitHub in-flight PR response was unavailable'
    );
  });

  it.each([
    ['no data', {}],
    ['no repository', { data: {} }],
    ['no pull requests', { data: { repository: {} } }],
    ['a negative total', graphql({ ...okPrs, totalCount: -1 })],
    ['a fractional total', graphql({ ...okPrs, totalCount: 1.5 })],
    ['missing nodes', graphql({ totalCount: 1 })],
  ])('rejects a payload with %s as malformed', async (_label, payload) => {
    expect(await parse(payload)).toThrow(
      'GitHub in-flight PR response was malformed'
    );
  });

  it('accepts an empty errors array alongside data', async () => {
    expect((await parse(graphql(okPrs, null, { errors: [] })))()).toMatchObject(
      {
        availability: 'available',
        totalOpen: 1,
        truncated: false,
      }
    );
  });

  it('marks the result truncated when the merge queue has more pages', async () => {
    const result = (
      await parse(
        graphql(
          { totalCount: 1, nodes: [lanePr(1)] },
          {
            entries: {
              pageInfo: { hasNextPage: true },
              nodes: [{ position: 0, pullRequest: lanePr(2) }],
            },
          }
        )
      )
    )();
    expect(result.truncated).toBe(true);
    expect(result.totalOpen).toBe(2);
    expect(result.items.map(pr => [pr.number, pr.status])).toEqual([
      [2, 'merge_queue'],
      [1, 'open'],
    ]);
  });

  it('ignores a merge queue without entries', async () => {
    const result = (await parse(graphql(okPrs, { entries: null })))();
    expect(result).toMatchObject({ totalOpen: 1, truncated: false });
  });
});
