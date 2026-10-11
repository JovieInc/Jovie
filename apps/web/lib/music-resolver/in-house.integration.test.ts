// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: vi.fn(() => false),
}));

const { mockExecute, mockLimit, mockWarn } = vi.hoisted(() => ({
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockLimit: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  musicBrainzLookupLimiter: {
    limit: mockLimit,
  },
}));

vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  musicBrainzCircuitBreaker: {
    execute: mockExecute,
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      totalFailures: 0,
      totalSuccesses: 0,
      requestsInWindow: 0,
    })),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockWarn,
  },
}));

import timArtist from '../dsp-enrichment/providers/fixtures/tim-white-musicbrainz.json';
import timUrl from '../dsp-enrichment/providers/fixtures/tim-white-musicbrainz-url.json';
import { resolveInHouse } from './in-house';

const TIM_ID = '51972833-bb04-46b7-9401-45a5ab449ebd';
const OTHER_TIM_ID = '8ac57f9f-0188-450a-b177-db336e5c2870';
const TIM_SPOTIFY = 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm';

function mockResponse(payload: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue(Response.json(payload, { status }));
}

describe('Music resolver MusicBrainz integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockImplementation(fn => fn());
    mockLimit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 1,
      reset: new Date(),
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves Tim from the exact Spotify relation through the real source adapter', async () => {
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/ws/2/url') {
        expect(url.searchParams.get('resource')).toBe(TIM_SPOTIFY);
        expect(url.searchParams.get('inc')).toBe('artist-rels');
        return Response.json(timUrl);
      }
      expect(url.pathname).toBe(`/ws/2/artist/${TIM_ID}`);
      expect(url.searchParams.get('inc')).toContain('release-groups');
      return Response.json(timArtist);
    });
    const result = await resolveInHouse({ kind: 'artist', url: TIM_SPOTIFY });
    expect(result).toMatchObject({
      status: 'resolved',
      mbid: TIM_ID,
      title: 'Tim White',
    });
    expect(result.artistMetadata).toMatchObject({
      source: 'musicbrainz',
      sourceUrl: `https://musicbrainz.org/artist/${TIM_ID}`,
      isnis: ['0000000427529721'],
      wikidataIds: ['Q16762431'],
      area: 'West Hollywood',
      origin: 'New Brunswick',
      releaseGroupsComplete: true,
    });
    expect(result.artistMetadata?.releaseGroups).toHaveLength(21);
    expect(result.artistMetadata?.externalLinks).toHaveLength(36);
    expect(result.artistMetadata?.externalLinks).toContainEqual(
      expect.objectContaining({
        provider: 'youtube',
        url: 'https://www.youtube.com/channel/UC90tJdD38139ytPUdEZVl1A',
      })
    );
    expect(result.artistMetadata?.externalLinks).toContainEqual(
      expect.objectContaining({
        provider: 'instagram',
        url: 'https://www.instagram.com/timwhite/',
      })
    );
    expect(result.links).toContainEqual(
      expect.objectContaining({
        provider: 'apple_music',
        url: 'https://music.apple.com/us/artist/id859547284',
        provenance: 'musicbrainz_url_rel',
      })
    );
    expect(
      result.links.find(link => link.provider === 'spotify')
    ).toMatchObject({ url: TIM_SPOTIFY, provenance: 'input_url' });
    expect(result.links.some(link => link.provider === 'instagram')).toBe(
      false
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mockLimit).toHaveBeenCalledTimes(2);
  });

  it('resolves a direct MusicBrainz URL even when the artist has no streaming links', async () => {
    mockResponse({
      id: TIM_ID,
      name: 'Tim White',
      isnis: ['0000000427529721'],
      'release-groups': [],
    });
    const result = await resolveInHouse({
      kind: 'artist',
      url: `https://musicbrainz.org/artist/${TIM_ID}`,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      mbid: TIM_ID,
      links: [],
    });
    expect(result.artistMetadata?.isnis).toEqual(['0000000427529721']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not choose between multiple artists linked to the same URL', async () => {
    mockResponse({
      resource: TIM_SPOTIFY,
      relations: [
        { artist: { id: TIM_ID, name: 'Tim White' } },
        { artist: { id: OTHER_TIM_ID, name: 'Tim White' } },
      ],
    });
    const result = await resolveInHouse({ kind: 'artist', url: TIM_SPOTIFY });
    expect(result.status).toBe('ambiguous');
    expect(result.mbid).toBeNull();
    expect(result.links).toEqual([]);
    expect(result.candidates.map(candidate => candidate.url)).toEqual([
      `https://musicbrainz.org/artist/${TIM_ID}`,
      `https://musicbrainz.org/artist/${OTHER_TIM_ID}`,
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps an unverified artist unresolved when the provider is unavailable', async () => {
    mockResponse({}, 404);
    const result = await resolveInHouse({ kind: 'artist', url: TIM_SPOTIFY });
    expect(result).toMatchObject({
      status: 'upstream_error',
      mbid: null,
      title: null,
      links: [],
      confidence: 0,
    });
    expect(result.artistMetadata).toBeUndefined();
  });
});
