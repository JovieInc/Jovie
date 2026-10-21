import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordStage: vi.fn(),
  auth: vi.fn(),
  entitlements: vi.fn(),
  dbRows: [] as unknown[][],
  limit: vi.fn(),
  spotifyAvailable: vi.fn(() => true),
  getArtist: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: mocks.recordStage,
}));
vi.mock('@/lib/auth/cached', () => ({ getOptionalAuth: mocks.auth }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/spotify', () => ({
  isSpotifyAvailable: mocks.spotifyAvailable,
  spotifyClient: { getArtist: mocks.getArtist },
}));
vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (result: unknown) => result,
  claimTokenAccessLimiter: { limit: mocks.limit },
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '203.0.113.7',
}));
vi.mock('@/lib/db', () => {
  const chain = (): Record<string, unknown> => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'from', 'leftJoin', 'where', 'orderBy']) {
      query[method] = () => query;
    }
    query.limit = async () => mocks.dbRows.shift() ?? [];
    return query;
  };
  return { db: { select: () => chain() } };
});

const { GET } = await import('./route');

const SPOTIFY_ID = '4Z8W4fKeB5YxbusRsdQVPb';

function request(query: string, cookie?: string) {
  return new NextRequest(`https://jov.ie/claim/start?${query}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function location(response: Response) {
  const url = new URL(response.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
}

describe('GET /claim/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbRows = [];
    mocks.limit.mockResolvedValue({ success: true });
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.spotifyAvailable.mockReturnValue(true);
    mocks.getArtist.mockResolvedValue({
      name: 'Indie Artist',
      followerCount: 900,
    });
  });

  it('records claim-start for the consented journey and sends a new artist to signup with Pro intent', async () => {
    const response = await GET(
      request(
        `spotify=${SPOTIFY_ID}`,
        'jv_acquisition_id=7c9e6679-7425-40de-944b-e07fc1f90ae7'
      )
    );

    expect(mocks.recordStage).toHaveBeenCalledWith(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'claim-start'
    );
    const target = new URL(location(response), 'https://jov.ie');
    expect(target.pathname).toBe('/signup');
    expect(target.searchParams.get('plan')).toBe('pro');
    expect(target.searchParams.get('artist_name')).toBe('Indie Artist');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('jovie_plan_intent=pro');
    expect(cookies).toContain('jovie_billing_interval=month');
    expect(cookies).toMatch(/jv_claim_flow=1;.*HttpOnly/i);
  });

  it('hands an unclaimed Jovie profile to the proof-checked claim route', async () => {
    mocks.dbRows = [
      [
        {
          username: 'indie',
          isClaimed: false,
          followers: 1_000,
          displayName: 'Indie',
        },
      ],
    ];
    const response = await GET(request(`spotify=${SPOTIFY_ID}`));
    expect(location(response)).toBe('/indie/claim?next=auth');
    expect(mocks.getArtist).not.toHaveBeenCalled();
  });

  it('stops famous artists before any ownership or payment step', async () => {
    mocks.getArtist.mockResolvedValue({
      name: 'Famous',
      followerCount: 80_000_000,
    });
    const response = await GET(request(`spotify=${SPOTIFY_ID}`));
    expect(location(response)).toBe('/claim?state=verification_required');
  });

  it('never routes reserved fixture identities to a claim', async () => {
    mocks.dbRows = [
      [
        {
          username: 'taylorswift',
          isClaimed: false,
          followers: 10,
          displayName: 'Taylor Swift',
        },
      ],
    ];
    const response = await GET(request(`spotify=${SPOTIFY_ID}`));
    expect(location(response)).toBe('/claim?state=verification_required');
  });

  it('reports an already-claimed profile', async () => {
    mocks.dbRows = [
      [{ username: 'indie', isClaimed: true, followers: 5, displayName: 'I' }],
    ];
    const response = await GET(request(`spotify=${SPOTIFY_ID}`));
    expect(location(response)).toBe('/claim?state=already_claimed');
  });

  it('sends an existing subscriber to the already-subscribed state', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.entitlements.mockResolvedValue({ isPro: true, isTrialing: false });
    mocks.dbRows = [[{ isClaimed: true }]];
    const response = await GET(request('new=1'));
    expect(location(response)).toBe('/claim?state=already_subscribed');
  });

  it('keeps successive viewers on their own claim path', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: 'subscriber' });
    mocks.entitlements.mockResolvedValue({ isPro: true, isTrialing: false });
    mocks.dbRows = [[{ isClaimed: true }]];
    expect(location(await GET(request('new=1')))).toBe(
      '/claim?state=already_subscribed'
    );

    const anonymous = await GET(request('new=1'));
    expect(location(anonymous)).toBe('/signup?plan=pro&interval=month');
    expect(anonymous.headers.get('Cache-Control')).toBe('no-store');
  });

  it('lets a trialing artist with a claimed profile pay', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.entitlements.mockResolvedValue({ isPro: true, isTrialing: true });
    mocks.dbRows = [[{ isClaimed: true }]];
    const response = await GET(request('new=1'));
    expect(location(response)).toBe(
      '/onboarding/checkout?plan=pro&interval=month&source=intent'
    );
  });

  it('fails closed when artist reach cannot be checked', async () => {
    mocks.spotifyAvailable.mockReturnValue(false);
    const response = await GET(request(`spotify=${SPOTIFY_ID}`));
    expect(location(response)).toBe('/claim?state=unavailable');
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('rejects malformed input and rate-limited callers', async () => {
    expect(location(await GET(request('spotify=../x')))).toBe('/claim');
    expect(mocks.recordStage).not.toHaveBeenCalled();

    mocks.limit.mockResolvedValue({ success: false });
    expect((await GET(request(`spotify=${SPOTIFY_ID}`))).status).toBe(429);
  });
});
