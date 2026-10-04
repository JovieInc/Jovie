import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  limit: vi.fn(),
  resolveTrackUrl: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: async () => ({ userId: null }),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: (...args: unknown[]) => state.capture(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: {
    limit: (...args: unknown[]) => state.limit(...args),
  },
  getClientIP: () => '192.0.2.10',
  createRateLimitHeaders: () => ({ 'X-RateLimit-Remaining': '99' }),
}));
vi.mock('@/lib/smart-link-mvp/resolve', () => ({
  createSmartLinkResolver: () => ({
    resolveTrackUrl: (...args: unknown[]) => state.resolveTrackUrl(...args),
    resolveIsrc: vi.fn(),
    searchTracks: vi.fn(),
    resolveArtist: vi.fn(),
  }),
}));
vi.mock('@/lib/smart-link-mvp/store', () => ({
  createSmartLinkStore: () => ({
    findByIsrc: async (isrc: string) =>
      state.rows.find(row => row.isrc === isrc) ?? null,
    findByProviderKey: async (providerKey: string) =>
      state.rows.find(row => row.providerKey === providerKey) ?? null,
    findCanonical: async () => null,
    countAnonymousInMonth: async () => state.rows.length,
    insertWithQuota: async (row: Record<string, unknown>) => {
      if (
        state.rows.some(
          saved =>
            (row.isrc && saved.isrc === row.isrc) ||
            (row.providerKey && saved.providerKey === row.providerKey)
        )
      ) {
        return 'conflict';
      }
      state.rows.push(row);
      return row;
    },
  }),
}));

import { GET, POST } from './route';

const TRACK = 'https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r';

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/links', () => {
  beforeEach(() => {
    state.rows = [];
    state.limit.mockResolvedValue({ success: true, unavailable: false });
    state.resolveTrackUrl.mockResolvedValue({
      ok: true,
      value: {
        title: 'Creep',
        artist: 'Radiohead',
        artworkUrl: null,
        isrc: 'GBAYE9200070',
        upc: null,
        providerKey: 'spotify:70LcF31zb1H0PyJoS1Sx1r',
        providers: [{ key: 'spotify', label: 'Spotify', url: TRACK }],
      },
    });
    process.env.FEATURE_SMART_LINK_MVP = 'true';
  });

  afterEach(() => {
    delete process.env.FEATURE_SMART_LINK_MVP;
    vi.clearAllMocks();
  });

  it('stays unavailable while the flag is off', async () => {
    delete process.env.FEATURE_SMART_LINK_MVP;
    expect((await post({ query: TRACK })).status).toBe(404);
    expect((await GET()).status).toBe(404);
    expect(state.limit).not.toHaveBeenCalled();
  });

  it('rate limits before resolving a recording', async () => {
    state.limit.mockResolvedValue({ success: false, unavailable: false });
    const response = await post({ query: TRACK });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(state.resolveTrackUrl).not.toHaveBeenCalled();
  });

  it('creates one unclaimed page and reuses it for the same recording', async () => {
    const created = await post({ query: TRACK });
    const first = (await created.json()) as {
      status: string;
      shortUrl: string;
      claimUrl: string;
      claimed: boolean;
    };
    expect(created.status).toBe(200);
    expect(first).toMatchObject({ status: 'created', claimed: false });
    expect(first.claimUrl).toBe(`${first.shortUrl}/claim`);

    const repeated = await post({ query: TRACK });
    expect(await repeated.json()).toMatchObject({
      status: 'existing',
      shortUrl: first.shortUrl,
    });
    expect(state.rows).toHaveLength(1);
    expect(state.resolveTrackUrl).toHaveBeenCalledTimes(1);
    expect((await GET()).status).toBe(405);
  });
});
