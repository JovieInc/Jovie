import { describe, expect, it } from 'vitest';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';

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
