import { describe, expect, it } from 'vitest';
import {
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
  pickPreferredArtistMetrics,
} from './canonical-metrics';

describe('normalizeArtistMetrics', () => {
  it('prefers spotifyFollowers over followers / followerCount', () => {
    const metrics = normalizeArtistMetrics(
      {
        spotifyFollowers: 1000,
        followers: 9999,
        followerCount: 50,
        monthlyListeners: 200_000,
      },
      { source: 'tool_output', updatedAt: '2026-07-01T00:00:00.000Z' }
    );

    expect(metrics).toEqual({
      spotifyFollowers: 1000,
      monthlyListeners: 200_000,
      source: 'tool_output',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('does not treat monthly listeners as Spotify followers', () => {
    const metrics = normalizeArtistMetrics({
      monthlyListeners: 500_000,
      monthly_listeners: 400_000,
    });

    expect(metrics.spotifyFollowers).toBeNull();
    expect(metrics.monthlyListeners).toBe(500_000);
  });

  it('reads nested Spotify API followers.total via followersObject', () => {
    const metrics = normalizeArtistMetrics(
      { followersObject: { total: 28_000_000 } },
      { source: 'spotify_api' }
    );

    expect(metrics.spotifyFollowers).toBe(28_000_000);
    expect(metrics.source).toBe('spotify_api');
  });

  it('rejects non-finite and negative counts', () => {
    const metrics = normalizeArtistMetrics({
      followers: Number.NaN,
      followerCount: -12,
      monthlyListeners: Number.POSITIVE_INFINITY,
    });

    expect(metrics.spotifyFollowers).toBeNull();
    expect(metrics.monthlyListeners).toBeNull();
  });

  it('truncates fractional counts to integers', () => {
    const metrics = normalizeArtistMetrics({
      followers: 12.9,
      monthlyListeners: 99.1,
    });

    expect(metrics.spotifyFollowers).toBe(12);
    expect(metrics.monthlyListeners).toBe(99);
  });

  it('falls back through follower field aliases without contradiction', () => {
    expect(normalizeArtistMetrics({ followerCount: 42 }).spotifyFollowers).toBe(
      42
    );
    expect(
      normalizeArtistMetrics({ followersTotal: 77 }).spotifyFollowers
    ).toBe(77);
    expect(normalizeArtistMetrics(null).spotifyFollowers).toBeNull();
  });
});

describe('pickPreferredArtistMetrics', () => {
  it('prefers confirmed metrics over search metrics when both exist', () => {
    const confirmed = normalizeArtistMetrics(
      { spotifyFollowers: 28_000_000 },
      { source: 'spotify_api' }
    );
    const search = normalizeArtistMetrics(
      { followers: 27_500_000 },
      { source: 'spotify_search' }
    );

    expect(
      pickPreferredArtistMetrics(confirmed, search)?.spotifyFollowers
    ).toBe(28_000_000);
  });

  it('uses fallback when primary has no follower count', () => {
    const empty = normalizeArtistMetrics({}, { source: 'tool_output' });
    const search = normalizeArtistMetrics(
      { followers: 1000 },
      { source: 'spotify_search' }
    );

    expect(pickPreferredArtistMetrics(empty, search)?.spotifyFollowers).toBe(
      1000
    );
  });
});

describe('getDisplaySpotifyFollowers', () => {
  it('returns only spotifyFollowers so UI cannot show monthly listeners as followers', () => {
    const metrics = normalizeArtistMetrics({
      spotifyFollowers: 1200,
      monthlyListeners: 90_000,
    });

    expect(getDisplaySpotifyFollowers(metrics)).toBe(1200);
    expect(getDisplaySpotifyFollowers(null)).toBeNull();
  });
});
