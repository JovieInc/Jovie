import { describe, expect, it } from 'vitest';
import {
  extractSpotifyArtistId,
  resolveSpotifyArtistIdentity,
} from '@/lib/spotify/artist-id';

describe('extractSpotifyArtistId', () => {
  it('extracts an artist id from a direct id input', () => {
    expect(extractSpotifyArtistId('4Z8W4fKeB5YxbusRsdQVPb')).toBe(
      '4Z8W4fKeB5YxbusRsdQVPb'
    );
  });

  it('extracts an artist id from a Spotify artist URL', () => {
    expect(
      extractSpotifyArtistId(
        'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb?si=abc123'
      )
    ).toBe('4Z8W4fKeB5YxbusRsdQVPb');
  });

  it('returns null for non-artist Spotify URLs', () => {
    expect(
      extractSpotifyArtistId(
        'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl'
      )
    ).toBeNull();
  });

  it('returns null for invalid hosts and malformed input', () => {
    expect(
      extractSpotifyArtistId(
        'https://example.com/artist/4Z8W4fKeB5YxbusRsdQVPb'
      )
    ).toBeNull();
    expect(extractSpotifyArtistId('not-a-url')).toBeNull();
  });
});

describe('resolveSpotifyArtistIdentity', () => {
  it('uses an exact active-link URL when legacy profile columns are empty', () => {
    expect(
      resolveSpotifyArtistIdentity([
        null,
        null,
        'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
      ])
    ).toEqual({
      status: 'resolved',
      spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
    });
  });

  it('dedupes matching exact IDs across profile fields', () => {
    expect(
      resolveSpotifyArtistIdentity([
        '4Uwpa6zW3zzCSQvooQNksm',
        'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm?si=profile',
      ])
    ).toMatchObject({
      status: 'resolved',
      spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
    });
  });

  it('fails closed for missing or conflicting exact IDs', () => {
    expect(resolveSpotifyArtistIdentity([null, ''])).toEqual({
      status: 'missing',
      spotifyArtistId: null,
    });
    expect(
      resolveSpotifyArtistIdentity([
        '4Uwpa6zW3zzCSQvooQNksm',
        'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
      ])
    ).toEqual({ status: 'conflict', spotifyArtistId: null });
  });
});
