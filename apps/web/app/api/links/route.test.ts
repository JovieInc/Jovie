import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  musicfetchCalls: 0,
  limit: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: (shape?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const counted = Boolean(shape && 'total' in shape);
          const result = counted ? [{ total: state.rows.length }] : state.rows;
          const query = Promise.resolve(result);
          return Object.assign(query, {
            limit: async (count = 1) => result.slice(0, count),
          });
        },
        innerJoin: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          const stored = {
            ...row,
            providers: row.providers ?? [],
          };
          state.rows.push(stored);
          return [stored];
        },
      }),
    }),
  },
}));

vi.mock('@/lib/smart-link-mvp/in-house', () => ({
  resolveInHouseTrackUrl: vi.fn(async (url: string) => ({
    title: 'Creep',
    artist: 'Radiohead',
    artworkUrl: null,
    isrc: 'GBAYE9200070',
    upc: null,
    providerKey: 'spotify:70LcF31zb1H0PyJoS1Sx1r',
    providers: [
      { key: 'spotify', label: 'Spotify', url },
      {
        key: 'apple_music',
        label: 'Apple Music',
        url: 'https://music.apple.com/us/song/creep/1679849823',
      },
    ],
  })),
  resolveInHouseIsrc: vi.fn(async () => null),
  searchInHouseTracks: vi.fn(async () => ({ status: 'ok', candidates: [] })),
  searchInHouseArtists: vi.fn(async () => []),
}));

vi.mock('@/lib/discography/musicfetch', () => ({
  isMusicfetchAvailable: () => false,
}));

vi.mock('@/lib/musicfetch/resilient-client', () => {
  class MusicfetchBudgetExceededError extends Error {
    override readonly name = 'MusicfetchBudgetExceededError';
  }
  return {
    MusicfetchBudgetExceededError,
    musicfetchRequest: vi.fn(async () => {
      state.musicfetchCalls += 1;
      return {
        result: {
          name: 'Creep',
          artists: [{ name: 'Radiohead' }],
          isrc: 'GBAYE9200070',
          services: {
            spotify: {
              link: 'https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r',
            },
          },
        },
      };
    }),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: {
    limit: (...args: unknown[]) => state.limit(...args),
  },
  getClientIP: () => '192.0.2.10',
  createRateLimitHeaders: () => ({ 'X-RateLimit-Remaining': '99' }),
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: async () => ({
    userId: null,
    sessionId: null,
    orgId: null,
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
    state.musicfetchCalls = 0;
    state.limit.mockResolvedValue({ success: true, unavailable: false });
    process.env.FEATURE_SMART_LINK_MVP = 'true';
  });

  afterEach(() => {
    delete process.env.FEATURE_SMART_LINK_MVP;
    vi.clearAllMocks();
  });

  it('404s while the flag is off and does not call MusicFetch', async () => {
    delete process.env.FEATURE_SMART_LINK_MVP;
    const response = await post({ query: TRACK });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'FEATURE_DISABLED',
    });
    expect(state.musicfetchCalls).toBe(0);
    expect((await GET()).status).toBe(404);
  });

  it('rate limits before resolving', async () => {
    state.limit.mockResolvedValue({ success: false, unavailable: false });
    const response = await post({ query: TRACK });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(state.musicfetchCalls).toBe(0);
  });

  it('creates one link from the in-house resolver and does not call MusicFetch', async () => {
    const created = await post({ query: TRACK });
    expect(created.status).toBe(200);
    const first = (await created.json()) as {
      status: string;
      shortUrl: string;
      claimed: boolean;
      claimUrl: string;
    };
    expect(first.status).toBe('created');
    expect(first.shortUrl).toMatch(/^https?:\/\/.+\/l\/[a-z2-9]{8}$/);
    expect(first.claimed).toBe(false);
    expect(first.claimUrl).toBe(`${first.shortUrl}/claim`);
    expect(state.musicfetchCalls).toBe(0);
    const body = first as { providers?: Array<{ key: string }> };
    expect(body.providers?.map(provider => provider.key)).toEqual([
      'spotify',
      'apple_music',
    ]);

    const again = await post({ query: TRACK });
    const second = (await again.json()) as { status: string; shortUrl: string };
    expect(second.status).toBe('existing');
    expect(second.shortUrl).toBe(first.shortUrl);
    expect(state.musicfetchCalls).toBe(0);
    expect((await GET()).status).toBe(405);
  });
});
