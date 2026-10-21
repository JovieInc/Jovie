import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getMerchMvpEnabled: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
  getActiveLinksForProfile: vi.fn(),
  getClientIP: vi.fn(),
  publicArtistApiLimiterLimit: vi.fn(),
  riderRows: vi.fn(),
  youtubeSnapshotRows: vi.fn(),
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

vi.mock('@/lib/db', () => ({
  db: {
    select: (columns: Record<string, unknown>) => {
      const rows = Object.hasOwn(columns, 'rawValues')
        ? hoisted.youtubeSnapshotRows()
        : hoisted.riderRows();
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => rows }),
            limit: () => rows,
          }),
        }),
      };
    },
  },
}));

vi.mock('@/lib/flags/profile-variant', () => ({
  getMerchMvpEnabled: hoisted.getMerchMvpEnabled,
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
vi.mock('@/lib/services/social-links/queries', () => ({
  getActiveLinksForProfile: hoisted.getActiveLinksForProfile,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

describe('GET /api/v1/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMerchMvpEnabled.mockResolvedValue(true);
    hoisted.getClientIP.mockReturnValue('203.0.113.10');
    hoisted.publicArtistApiLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
    hoisted.getActiveLinksForProfile.mockResolvedValue([]);
    hoisted.riderRows.mockResolvedValue([]);
    hoisted.youtubeSnapshotRows.mockResolvedValue([]);
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
      creatorType: 'creator',
      spotifyId: 'spotify-artist-1',
      appleMusicId: 'apple-artist-1',
      youtubeMusicId: null,
      deezerId: 'deezer-artist-1',
      tidalId: null,
      soundcloudId: 'realartist',
      musicbrainzId: null,
      spotifyFollowers: 9876,
    });
    hoisted.getActiveLinksForProfile.mockResolvedValue([
      {
        platform: 'website',
        url: 'https://realartist.example',
        displayText: 'Official website',
      },
      {
        platform: 'instagram',
        url: 'https://instagram.com/realartist',
        displayText: null,
      },
    ]);
    hoisted.youtubeSnapshotRows.mockResolvedValue([
      {
        rawValues: {
          precision: 'exact',
          subscriberCount: 1234567,
          channelId: 'UC1234567890123456789012',
        },
        fetchedAt: new Date('2026-10-02T18:30:00.000Z'),
      },
    ]);
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
    const body = await res.json();
    expect(body.artist).toMatchObject({
      username: 'realartist',
      creatorType: 'creator',
      audience: {
        platform: 'youtube',
        count: 1234567,
        countText: '1,234,567',
        observedAt: '2026-10-02T18:30:00.000Z',
      },
      links: [
        {
          platform: 'website',
          url: 'https://realartist.example',
          displayText: 'Official website',
        },
        {
          platform: 'instagram',
          url: 'https://instagram.com/realartist',
          displayText: null,
        },
      ],
      platformIds: {
        spotify: 'spotify-artist-1',
        appleMusic: 'apple-artist-1',
        youtube: 'UC1234567890123456789012',
        deezer: 'deezer-artist-1',
        tidal: null,
        soundcloud: 'realartist',
        musicbrainz: null,
      },
    });
    expect(body._links.rider).toBeUndefined();
  });

  it('does not expose a rounded audience count and derives a channel ID from the public URL', async () => {
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
      youtubeUrl: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      creatorType: 'artist',
      spotifyId: null,
      appleMusicId: null,
      youtubeMusicId: null,
      deezerId: null,
      tidalId: null,
      soundcloudId: null,
      musicbrainzId: null,
      spotifyFollowers: null,
    });
    hoisted.youtubeSnapshotRows.mockResolvedValue([
      {
        rawValues: {
          precision: 'rounded',
          subscriberCount: 1200000,
          channelId: null,
        },
        fetchedAt: new Date('2026-10-02T18:30:00.000Z'),
      },
    ]);
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });
    const body = await res.json();

    expect(body.artist.audience).toBeNull();
    expect(body.artist.platformIds.youtube).toBe('UCabcdefghijklmnopqrstuv');
  });

  it('falls back to stored Spotify followers without inventing an observation time', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
      bio: null,
      location: null,
      genres: [],
      avatarUrl: null,
      spotifyUrl: 'https://open.spotify.com/artist/spotify-artist-1',
      appleMusicUrl: null,
      youtubeUrl: null,
      creatorType: 'artist',
      spotifyId: 'spotify-artist-1',
      appleMusicId: null,
      youtubeMusicId: null,
      deezerId: null,
      tidalId: null,
      soundcloudId: null,
      musicbrainzId: null,
      spotifyFollowers: 9876,
    });
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });
    const body = await res.json();

    expect(body.artist.audience).toEqual({
      platform: 'spotify',
      count: 9876,
      countText: '9,876',
      observedAt: null,
    });
  });

  it('uses persisted release slugs and live product IDs rather than collection destinations', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      usernameNormalized: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
      isClaimed: false,
      isVerified: false,
      claimToken: 'private-token',
      email: 'private@example.com',
    });
    hoisted.getReleasesForProfileLite.mockResolvedValue([
      {
        id: 'release-1',
        title: 'Same Title',
        slug: 'same-title-2025',
        releaseType: 'single',
        releaseDate: '2025-01-02',
        artworkUrl: null,
      },
      {
        id: 'release-2',
        title: 'Same Title',
        slug: 'same-title-2',
        releaseType: 'album',
        releaseDate: null,
        artworkUrl: null,
      },
      ...[
        null,
        '',
        '.',
        '..',
        'releases',
        'bad/slug',
        'bad\\slug',
        'bad\nslug',
      ].map(slug => ({ id: 'unsupported', title: 'Unsupported', slug })),
    ]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Tour Tee',
        description: 'Cotton',
        productType: 'shirt',
        primaryImageUrl: null,
        retailPriceCents: 2500,
      },
      { id: '', title: 'Unsupported' },
    ]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);
    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/REALARTIST'), {
      params: Promise.resolve({ username: 'REALARTIST' }),
    });
    const body = await res.json();
    expect(body.releases).toEqual([
      {
        id: 'release-1',
        title: 'Same Title',
        type: 'single',
        releaseDate: '2025-01-02',
        artworkUrl: null,
        url: 'https://jov.ie/realartist/same-title-2025',
      },
      {
        id: 'release-2',
        title: 'Same Title',
        type: 'album',
        releaseDate: null,
        artworkUrl: null,
        url: 'https://jov.ie/realartist/same-title-2',
      },
    ]);
    expect(body.merch).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000002',
        url: 'https://jov.ie/realartist/merch/00000000-0000-4000-8000-000000000002',
      }),
    ]);
    expect(body.artist).toMatchObject({
      profileUrl: 'https://jov.ie/realartist',
      isClaimed: false,
      isVerified: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/private-token|private@example/);
    expect(hoisted.getReleasesForProfileLite).toHaveBeenCalledWith('profile-1');
    expect(hoisted.getLiveMerchCardsForProfile).toHaveBeenCalledWith(
      'profile-1'
    );
  });

  it('does not advertise product destinations when the public merch page is disabled', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: true,
    });
    hoisted.getMerchMvpEnabled.mockResolvedValue(false);
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);
    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });
    expect((await res.json()).merch).toEqual([]);
    expect(hoisted.getLiveMerchCardsForProfile).not.toHaveBeenCalled();
  });

  it('hides a private profile the same way as a missing one', async () => {
    hoisted.getProfileByUsername.mockResolvedValue({
      id: 'profile-1',
      username: 'realartist',
      displayName: 'Real Artist',
      isPublic: false,
      bio: null,
      location: null,
      genres: [],
      avatarUrl: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      youtubeUrl: null,
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
      params: Promise.resolve({ username: 'realartist' }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Artist not found' });
    expect(hoisted.getReleasesForProfileLite).not.toHaveBeenCalled();
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
