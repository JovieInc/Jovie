import { beforeEach, describe, expect, it, vi } from 'vitest';

const house = vi.hoisted(() => ({
  track: vi.fn(),
  isrc: vi.fn(),
  search: vi.fn(),
  artists: vi.fn(),
  musicfetchCalls: 0,
  available: true,
  musicfetchError: null as Error | null,
}));

vi.mock('server-only', () => ({}));

vi.mock('./in-house', () => ({
  resolveInHouseTrackUrl: (...args: unknown[]) => house.track(...args),
  resolveInHouseIsrc: (...args: unknown[]) => house.isrc(...args),
  searchInHouseTracks: (...args: unknown[]) => house.search(...args),
  searchInHouseArtists: (...args: unknown[]) => house.artists(...args),
}));

vi.mock('@/lib/discography/musicfetch', () => ({
  isMusicfetchAvailable: () => house.available,
}));

vi.mock('@/lib/musicfetch/resilient-client', () => {
  class MusicfetchBudgetExceededError extends Error {
    override readonly name = 'MusicfetchBudgetExceededError';
  }
  return {
    MusicfetchBudgetExceededError,
    musicfetchRequest: vi.fn(async () => {
      house.musicfetchCalls += 1;
      if (house.musicfetchError) throw house.musicfetchError;
      return { result: { name: 'Creep', services: {} } };
    }),
  };
});

vi.mock('@/lib/agent-acquisition/artist-resolution', () => ({
  resolveAgentArtist: vi.fn(async () => ({
    status: 'error',
    code: 'UPSTREAM_FAILURE',
    retryable: true,
  })),
}));

import { createSmartLinkResolver } from './resolve';

const RELEASE = {
  title: 'Motion Sickness',
  artist: 'Phoebe Bridgers',
  artworkUrl: null,
  isrc: 'USJ5G1714202',
  upc: null,
  providerKey: 'apple_music:1256607810',
  providers: [
    {
      key: 'apple_music',
      label: 'Apple Music',
      url: 'https://music.apple.com/us/album/motion-sickness/1256607808?i=1256607810',
    },
    {
      key: 'deezer',
      label: 'Deezer',
      url: 'https://www.deezer.com/track/384037361',
    },
  ],
};

describe('createSmartLinkResolver', () => {
  beforeEach(() => {
    house.track.mockReset();
    house.isrc.mockReset();
    house.search.mockReset();
    house.artists.mockReset();
    house.musicfetchCalls = 0;
    house.available = true;
    house.musicfetchError = null;
  });

  it('keeps an in-house recording and does not call MusicFetch', async () => {
    house.track.mockResolvedValue(RELEASE);
    const result = await createSmartLinkResolver().resolveTrackUrl(
      'https://music.apple.com/us/album/motion-sickness/1256607808?i=1256607810'
    );
    expect(result).toEqual({ ok: true, value: RELEASE });
    expect(house.musicfetchCalls).toBe(0);
  });

  it('turns a MusicFetch 401 into not-found when nothing else matched', async () => {
    house.track.mockResolvedValue(null);
    house.musicfetchError = Object.assign(new Error('unauthorized'), {
      statusCode: 401,
    });
    const result = await createSmartLinkResolver().resolveTrackUrl(
      'https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r'
    );
    expect(result).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      retryable: false,
    });
    expect(house.musicfetchCalls).toBe(1);
  });

  it('does not call MusicFetch after an in-house search, including an empty one', async () => {
    house.available = true;
    house.search.mockResolvedValue({ status: 'ok', candidates: [] });
    const result = await createSmartLinkResolver().searchTracks(
      'No Such Artist - Missing Song'
    );
    expect(result).toEqual({ ok: true, value: [] });
    expect(house.musicfetchCalls).toBe(0);
  });

  it('says the music services could not be reached when both lookups are down', async () => {
    house.available = false;
    house.search.mockResolvedValue({ status: 'unavailable' });
    const result = await createSmartLinkResolver().searchTracks(
      'Phoebe Bridgers - Motion Sickness'
    );
    expect(result).toEqual({
      ok: false,
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
  });
});
