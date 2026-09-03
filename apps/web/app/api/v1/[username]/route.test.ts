import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
  getClientIP: vi.fn(),
  publicArtistApiLimiterLimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: (
    result: {
      success: boolean;
      limit: number;
      remaining: number;
      reset: Date;
    },
    options: { policyName: string; windowSeconds: number }
  ) => {
    const retryAfter = Math.max(
      0,
      Math.ceil((result.reset.getTime() - Date.now()) / 1000)
    );
    return {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.floor(result.reset.getTime() / 1000)),
      'RateLimit-Policy': `"${options.policyName}";q=${result.limit};w=${options.windowSeconds}`,
      RateLimit: `"${options.policyName}";r=${result.remaining};t=${retryAfter}`,
      ...(result.success ? {} : { 'Retry-After': String(retryAfter) }),
    };
  },
  getClientIP: hoisted.getClientIP,
  publicArtistApiLimiter: {
    limit: hoisted.publicArtistApiLimiterLimit,
  },
}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
}));
vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: hoisted.getLiveMerchCardsForProfile,
}));
vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: hoisted.getUpcomingTourDatesForProfile,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

describe('GET /api/v1/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getClientIP.mockReturnValue('203.0.113.10');
    hoisted.publicArtistApiLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('excludes protected synthetic identities from public API discovery', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/taylorswift'), {
      params: Promise.resolve({ username: 'taylorswift' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Link')).toContain('rel="deprecation"');
    expect(res.headers.get('RateLimit-Policy')).toBe(
      '"public-artist";q=100;w=60'
    );
    expect(res.headers.get('RateLimit')).toMatch(
      /^"public-artist";r=99;t=\d+$/
    );
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(await res.json()).toEqual({ error: 'Artist not found' });
    expect(hoisted.getProfileByUsername).not.toHaveBeenCalled();
    expect(hoisted.publicArtistApiLimiterLimit).toHaveBeenCalledWith(
      '203.0.113.10'
    );
  });

  it('keeps legitimate public profiles available', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
      bio: null,
      location: null,
      genres: [],
      avatarUrl: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
    });
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Link')).toContain('rel="deprecation"');
    expect(res.headers.get('RateLimit-Policy')).toBe(
      '"public-artist";q=100;w=60'
    );
    expect(res.headers.get('RateLimit')).toMatch(
      /^"public-artist";r=99;t=\d+$/
    );
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(res.headers.get('Retry-After')).toBeNull();
    expect((await res.json()).artist.username).toBe('realartist');
  });

  it('returns typed 404 responses with the caller rate-limit fields', async () => {
    hoisted.getProfileByUsername.mockResolvedValue(null);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/missing'), {
      params: Promise.resolve({ username: 'missing' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Link')).toContain('rel="deprecation"');
    expect(res.headers.get('RateLimit-Policy')).toBe(
      '"public-artist";q=100;w=60'
    );
    expect(res.headers.get('RateLimit')).toMatch(
      /^"public-artist";r=99;t=\d+$/
    );
    expect(res.headers.get('X-RateLimit-Reset')).toMatch(/^\d+$/);
    expect(res.headers.get('Retry-After')).toBeNull();
    expect(await res.json()).toEqual({ error: 'Artist not found' });
  });

  it('returns 429 with standard and legacy headers without touching profile data', async () => {
    hoisted.publicArtistApiLimiterLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Link')).toContain('rel="deprecation"');
    expect(res.headers.get('RateLimit-Policy')).toBe(
      '"public-artist";q=100;w=60'
    );
    expect(res.headers.get('RateLimit')).toMatch(/^"public-artist";r=0;t=\d+$/);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await res.json()).toEqual({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
    expect(hoisted.getProfileByUsername).not.toHaveBeenCalled();
    expect(hoisted.getReleasesForProfileLite).not.toHaveBeenCalled();
  });

  it('returns 503 with service retry guidance when durable limiting is unavailable', async () => {
    hoisted.publicArtistApiLimiterLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
      unavailable: true,
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Link')).toContain('rel="deprecation"');
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('RateLimit-Policy')).toBe(
      '"public-artist";q=100;w=60'
    );
    expect(res.headers.get('RateLimit')).toBeNull();
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(await res.json()).toEqual({
      error: 'Public API temporarily unavailable',
      code: 'RATE_LIMIT_UNAVAILABLE',
    });
    expect(hoisted.getProfileByUsername).not.toHaveBeenCalled();
  });
});
