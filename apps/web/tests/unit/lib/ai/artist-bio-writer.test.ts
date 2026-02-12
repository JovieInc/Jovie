import { describe, expect, it } from 'vitest';
import { buildArtistBioDraft } from '@/lib/ai/artist-bio-writer';

describe('buildArtistBioDraft', () => {
  it('builds a structured draft with facts and directives', () => {
    const result = buildArtistBioDraft({
      artistName: 'Nova Echo',
      existingBio:
        'Independent artist blending electronic and alt-pop textures.',
      genres: ['electronic', 'alt-pop'],
      spotifyFollowers: 25300,
      spotifyPopularity: 61,
      spotifyUrl: 'https://open.spotify.com/artist/123',
      appleMusicUrl: 'https://music.apple.com/us/artist/123',
      profileViews: 9821,
      releaseCount: 7,
      notableReleases: ['Midnight Static', 'Gravity Lessons'],
    });

    expect(result.draft).toContain('Nova Echo');
    expect(result.draft).toContain('25,300');
    expect(result.facts).toContain('Catalog size: 7 releases');
    expect(result.voiceDirectives.length).toBeGreaterThanOrEqual(3);
  });

  it('handles sparse data without throwing', () => {
    const result = buildArtistBioDraft({
      artistName: 'New Signal',
      existingBio: null,
      genres: [],
      spotifyFollowers: null,
      spotifyPopularity: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      profileViews: 0,
      releaseCount: 0,
      notableReleases: [],
    });

    expect(result.draft).toContain('New Signal');
    expect(result.facts).toContain('Spotify followers: not available');
    expect(result.facts).toContain('Spotify profile linked: no');
  });
});
