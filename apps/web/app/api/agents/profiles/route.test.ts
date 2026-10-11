import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  flag: vi.fn(),
  limit: vi.fn(),
  spotify: vi.fn(),
  ingest: vi.fn(),
  selectRows: [] as unknown[][],
}));

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: hoisted.flag }));
vi.mock('@/lib/rate-limit', () => ({
  agentProfileCreateLimiter: { limit: hoisted.limit },
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/ingestion/flows/spotify-integration', () => ({
  fetchSpotifyArtistData: hoisted.spotify,
}));
vi.mock('@/lib/ingestion/flows/social-platform-ingest', () => ({
  ingestSocialPlatformUrl: hoisted.ingest,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => hoisted.selectRows.shift() ?? [],
          }),
          limit: async () => hoisted.selectRows.shift() ?? [],
        }),
      }),
    }),
  },
}));

const { POST } = await import('./route');

const SPOTIFY_URL = 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb';

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/agents/profiles', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/agents/profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectRows = [];
    hoisted.flag.mockResolvedValue(true);
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.spotify.mockResolvedValue({
      name: 'Radiohead',
      spotifyId: '4Z8W4fKeB5YxbusRsdQVPb',
    });
  });

  it('returns 503 when the kill switch is off', async () => {
    hoisted.flag.mockResolvedValue(false);
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('FEATURE_DISABLED');
  });

  it('returns 429 when rate limited and 503 when the limiter is down', async () => {
    hoisted.limit.mockResolvedValueOnce({ success: false });
    expect((await post({ url: SPOTIFY_URL })).status).toBe(429);
    hoisted.limit.mockResolvedValueOnce({ success: false, unavailable: true });
    expect((await post({ url: SPOTIFY_URL })).status).toBe(503);
  });

  it('rejects non-Spotify-artist URLs before any lookup', async () => {
    for (const url of [
      'https://instagram.com/radiohead',
      'https://open.spotify.com/track/abc',
    ]) {
      const res = await post({ url });
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('UNSUPPORTED_URL');
    }
    expect((await post({ nope: 1 })).status).toBe(400);
    expect(hoisted.spotify).not.toHaveBeenCalled();
  });

  it('returns 404 when Spotify has no such artist', async () => {
    hoisted.spotify.mockResolvedValue(null);
    expect((await post({ url: SPOTIFY_URL })).status).toBe(404);
  });

  it('returns an existing profile untouched without a claim token', async () => {
    hoisted.selectRows = [
      [{ username: 'radiohead', isClaimed: false, isPublic: true }],
    ];
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      username: 'radiohead',
      profileUrl: 'https://jov.ie/radiohead',
      claimUrl: 'https://jov.ie/radiohead/claim',
      claimed: false,
      public: true,
      created: false,
    });
    expect(hoisted.ingest).not.toHaveBeenCalled();
  });

  it('omits the claim URL for a claimed profile', async () => {
    hoisted.selectRows = [
      [{ username: 'radiohead', isClaimed: true, isPublic: true }],
    ];
    const body = await (await post({ url: SPOTIFY_URL })).json();
    expect(body.claimUrl).toBeNull();
    expect(body.claimed).toBe(true);
  });

  it('prefers the canonical handle when a QA duplicate shares the Spotify ID', async () => {
    // JOV-6919: `tmoc*` machine handles are excluded from every public surface
    // (profile page, /api/v1) — returning one hands agents a 404 phantom.
    hoisted.selectRows = [
      [
        { username: 'tmoc9mm7xfvx02c', isClaimed: true, isPublic: true },
        { username: 'tim', isClaimed: true, isPublic: true },
      ],
    ];
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(200);
    expect((await res.json()).username).toBe('tim');
    expect(hoisted.ingest).not.toHaveBeenCalled();
  });

  it('creates a new profile when only an internal handle holds the Spotify ID', async () => {
    hoisted.selectRows = [
      [{ username: 'tmoc9mm7xfvx02c', isClaimed: true, isPublic: true }],
      [{ isPublic: true }],
    ];
    hoisted.ingest.mockResolvedValue(
      Response.json({ ok: true, profile: { username: 'tim_1' } })
    );
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(201);
    expect((await res.json()).username).toBe('tim_1');
    expect(hoisted.ingest).toHaveBeenCalledWith(SPOTIFY_URL, {
      allocateNewHandleOnCollision: true,
    });
  });

  it('creates a profile with collision-safe ingestion', async () => {
    hoisted.selectRows = [[], [{ isPublic: true }]];
    hoisted.ingest.mockResolvedValue(
      Response.json({ ok: true, profile: { username: 'radiohead_1' } })
    );
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(201);
    expect(hoisted.ingest).toHaveBeenCalledWith(SPOTIFY_URL, {
      allocateNewHandleOnCollision: true,
    });
    const body = await res.json();
    expect(body).toMatchObject({
      username: 'radiohead_1',
      claimUrl: 'https://jov.ie/radiohead_1/claim',
      created: true,
      public: true,
    });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it('surfaces ingestion failures with a stable code', async () => {
    hoisted.ingest.mockResolvedValue(
      Response.json({ error: 'Invalid username' }, { status: 422 })
    );
    const res = await post({ url: SPOTIFY_URL });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toEqual({
      code: 'CREATE_FAILED',
      message: 'Invalid username',
    });
  });
});
