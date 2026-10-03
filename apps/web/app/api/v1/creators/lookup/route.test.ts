import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  lookupCreator: vi.fn(),
  getClientIP: vi.fn(),
  limit: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/creator-lookup', () => ({
  lookupCreator: hoisted.lookupCreator,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: (result: { remaining: number }) => ({
    'RateLimit-Policy': '"public-artist";q=100;w=60',
    RateLimit: `"public-artist";r=${result.remaining};t=60`,
  }),
  getClientIP: hoisted.getClientIP,
  publicArtistApiLimiter: { limit: hoisted.limit },
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

const CHANNEL = {
  channelId: 'UCabcdefghijklmnopqrstuv',
  title: "Ari's Take",
  handle: 'aristake',
  uploadsPlaylistId: 'UUabcdefghijklmnopqrstuv',
  description: 'Music business education',
  country: 'US',
  avatarUrl: 'https://yt3.example/avatar.jpg',
};

describe('GET /api/v1/creators/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getClientIP.mockReturnValue('203.0.113.10');
    hoisted.limit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('returns a fresh extraction marked exists:false', async () => {
    hoisted.lookupCreator.mockResolvedValue({
      kind: 'success',
      channel: CHANNEL,
      profile: null,
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://jov.ie/api/v1/creators/lookup?input=youtube%3Aaristake'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      exists: false,
      creator: {
        name: "Ari's Take",
        handle: 'aristake',
        bio: 'Music business education',
        location: 'US',
        avatarUrl: 'https://yt3.example/avatar.jpg',
        channel: {
          platform: 'youtube',
          id: 'UCabcdefghijklmnopqrstuv',
          url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
        },
        links: [
          {
            platform: 'youtube',
            url: 'https://www.youtube.com/@aristake',
          },
        ],
      },
      jovie: null,
    });
  });

  it('returns the matched Jovie profile without guessing by username', async () => {
    hoisted.lookupCreator.mockResolvedValue({
      kind: 'success',
      channel: CHANNEL,
      profile: {
        username: 'aris-take',
        displayName: "Ari's Take",
        bio: null,
        location: 'Los Angeles, CA',
        avatarUrl: null,
        spotifyUrl: 'https://open.spotify.com/artist/example',
        appleMusicUrl: null,
      },
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://jov.ie/api/v1/creators/lookup?input=https%3A%2F%2Fyoutube.com%2F%40aristake'
      )
    );
    const body = await response.json();

    expect(body.exists).toBe(true);
    expect(body.creator.location).toBe('Los Angeles, CA');
    expect(body.jovie).toEqual({
      username: 'aris-take',
      profileUrl: 'https://jov.ie/aris-take',
      apiUrl: 'https://jov.ie/api/v1/aris-take',
    });
  });

  it.each([
    ['invalid_input', 400, 'INVALID_CREATOR_LOOKUP'],
    ['channel_not_found', 404, 'CREATOR_NOT_FOUND'],
    ['ambiguous', 409, 'CREATOR_LOOKUP_AMBIGUOUS'],
  ])('returns a stable error for %s', async (kind, status, code) => {
    hoisted.lookupCreator.mockResolvedValue({ kind });
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://jov.ie/api/v1/creators/lookup?input=bad')
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });

  it('fails closed before lookup when the durable limiter is unavailable', async () => {
    hoisted.limit.mockResolvedValue({
      success: false,
      unavailable: true,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://jov.ie/api/v1/creators/lookup?input=youtube%3Aaristake'
      )
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(hoisted.lookupCreator).not.toHaveBeenCalled();
  });
});
