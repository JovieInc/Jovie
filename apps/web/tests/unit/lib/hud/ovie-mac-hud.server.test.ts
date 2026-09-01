import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';

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

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    },
  };
});

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: vi.fn(),
}));

vi.mock('@/lib/admin/mercury-metrics', () => ({
  getAdminMercuryMetrics: vi.fn(),
}));

function stripeAvailable() {
  return {
    mrrUsd: 5200,
    activeSubscribers: 10,
    mrrUsd30dAgo: 5000,
    mrrGrowth30dUsd: 200,
    isConfigured: true,
    isAvailable: true,
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
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue(
      stripeAvailable()
    );
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(mercuryAvailable());
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
                    headRefName: 'tim/jov-16931',
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
                    headRefName: 'tim/jov-16927',
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
                        headRefName: 'tim/jov-16886',
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
