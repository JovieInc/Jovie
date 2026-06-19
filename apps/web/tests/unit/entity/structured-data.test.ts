/**
 * Unit tests for music asset structured data — artist entity sameAs on byArtist.
 */

import { describe, expect, it } from 'vitest';
import { generateMusicStructuredData } from '@/app/[username]/[slug]/_lib/structured-data';

describe('generateMusicStructuredData artistSameAs', () => {
  it('includes entity sameAs on byArtist MusicGroup', () => {
    const data = generateMusicStructuredData(
      {
        type: 'release',
        title: 'Test Album',
        slug: 'test-album',
        artworkUrl: null,
        releaseDate: null,
        providerLinks: [
          { providerId: 'spotify', url: 'https://open.spotify.com/album/1' },
        ],
      },
      {
        displayName: 'Artist',
        username: 'artist',
        usernameNormalized: 'artist',
        artistSameAs: [
          'https://www.wikidata.org/wiki/Q999',
          'https://musicbrainz.org/artist/mbid-1',
        ],
      }
    );

    const musicSchema = data['@graph'][0] as Record<string, unknown>;
    const byArtist = musicSchema.byArtist as Record<string, unknown>;
    expect(byArtist.sameAs).toEqual([
      'https://www.wikidata.org/wiki/Q999',
      'https://musicbrainz.org/artist/mbid-1',
    ]);
  });

  it('omits sameAs on byArtist when artistSameAs is empty', () => {
    const data = generateMusicStructuredData(
      {
        type: 'track',
        title: 'Test Track',
        slug: 'test-track',
        artworkUrl: null,
        releaseDate: null,
        providerLinks: [],
      },
      {
        displayName: null,
        username: 'artist',
        usernameNormalized: 'artist',
        artistSameAs: [],
      }
    );

    const musicSchema = data['@graph'][0] as Record<string, unknown>;
    const byArtist = musicSchema.byArtist as Record<string, unknown>;
    expect(byArtist).not.toHaveProperty('sameAs');
  });
});
