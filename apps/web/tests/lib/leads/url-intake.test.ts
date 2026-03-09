import { describe, expect, it } from 'vitest';
import { classifyUrlKind, seedLeadFromUrl } from '@/lib/leads/url-intake';

describe('url intake helpers', () => {
  it('classifies supported URL kinds', () => {
    expect(classifyUrlKind('https://linktr.ee/artist')).toBe('linktree');
    expect(classifyUrlKind('https://open.spotify.com/artist/abc')).toBe(
      'spotify'
    );
    expect(classifyUrlKind('https://instagram.com/artist')).toBe('instagram');
    expect(classifyUrlKind('https://music.apple.com/us/artist/foo/123')).toBe(
      'apple_music'
    );
    expect(classifyUrlKind('https://artist.example.com')).toBe('website');
  });

  it('seeds lead payload with platform hints', () => {
    const spotifySeed = seedLeadFromUrl('https://open.spotify.com/artist/abc');

    expect(spotifySeed).toMatchObject({
      kind: 'spotify',
      hasSpotifyLink: true,
      spotifyUrl: 'https://open.spotify.com/artist/abc',
      hasInstagram: false,
    });

    const instagramSeed = seedLeadFromUrl('https://instagram.com/artist_name');
    expect(instagramSeed).toMatchObject({
      kind: 'instagram',
      hasInstagram: true,
      instagramHandle: 'instagramcom-artist_name',
    });
  });

  it('returns null for invalid URLs', () => {
    expect(seedLeadFromUrl('not-a-url')).toBeNull();
  });
});
