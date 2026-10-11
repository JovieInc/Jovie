import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const musicfetchRequest = vi.fn();
vi.mock('@/lib/musicfetch/resilient-client', () => ({
  musicfetchRequest: (...args: unknown[]) => musicfetchRequest(...args),
}));

import type { InHouseSources } from './in-house';
import { PROVENANCE_CONFIDENCE } from './in-house';
import { resolveSmartLinkCreation } from './smart-link';

function sources(overrides: Partial<InHouseSources> = {}): InHouseSources {
  return {
    trackByIsrc: async () => [],
    trackByUrl: async () => null,
    searchTracks: async () => [],
    albumByUpc: async () => null,
    albumByUrl: async () => null,
    searchAlbums: async () => [],
    artistCandidates: async () => [],
    artistByUrl: async () => [],
    artistByMbid: async () => null,
    urlRelsForIsrc: async () => [],
    ...overrides,
  };
}

describe('smart-link creation without MusicFetch', () => {
  it('does not import or call MusicFetch', () => {
    const files = ['smart-link.ts', 'in-house.ts', 'in-house-sources.ts'];
    for (const file of files) {
      const source = readFileSync(
        path.join(process.cwd(), 'lib/music-resolver', file),
        'utf8'
      );
      expect(source).not.toMatch(
        /musicfetchRequest|api\.musicfetch\.io|@\/lib\/musicfetch|song\.link|odesli\.app/
      );
    }
  });

  it('creates a track, album, and artist result without calling MusicFetch', async () => {
    const track = await resolveSmartLinkCreation(
      { source: 'isrc', isrc: 'USRC17607839' },
      sources({
        trackByIsrc: async () => [
          {
            provider: 'apple_music',
            title: 'Signal Fire',
            artist: 'The Artist',
            url: 'https://music.apple.com/us/song/signal-fire/1234',
            isrc: 'USRC17607839',
            upc: null,
            provenance: 'apple_music_isrc',
            confidence: PROVENANCE_CONFIDENCE.isrc_exact,
          },
        ],
      })
    );
    const album = await resolveSmartLinkCreation(
      { source: 'album_upc', upc: '196589508261' },
      sources({
        albumByUpc: async () => ({
          provider: 'deezer',
          title: 'Signal Fire',
          artist: 'The Artist',
          url: 'https://www.deezer.com/album/1234',
          upc: '196589508261',
          provenance: 'upc_exact',
          confidence: PROVENANCE_CONFIDENCE.upc_exact,
        }),
      })
    );
    const artist = await resolveSmartLinkCreation(
      { source: 'artist', name: 'The Artist' },
      sources({
        artistCandidates: async () => [
          {
            name: 'The Artist',
            url: 'https://music.apple.com/us/artist/the-artist/42',
            mbid: '6c3e5c0a-2b2a-4c1a-9c1a-0b0b0b0b0b0b',
            links: [
              {
                provider: 'apple_music',
                url: 'https://music.apple.com/us/artist/the-artist/42',
                provenance: 'musicbrainz_url_rel',
                confidence: PROVENANCE_CONFIDENCE.musicbrainz_url_rel,
              },
            ],
          },
        ],
      })
    );

    expect(track).toMatchObject({
      status: 'resolved',
      retryable: false,
      isrc: 'USRC17607839',
      providers: [
        {
          key: 'apple_music',
          url: 'https://music.apple.com/us/song/signal-fire/1234',
        },
      ],
    });
    expect(album).toMatchObject({
      status: 'resolved',
      upc: '196589508261',
      providers: [{ key: 'deezer' }],
    });
    expect(artist).toMatchObject({
      status: 'resolved',
      artist: 'The Artist',
      providers: [{ key: 'apple_music' }],
    });
    expect(musicfetchRequest).not.toHaveBeenCalled();
  });

  it('returns choices for a non-exact recording and not-found without a vendor retry', async () => {
    const choices = await resolveSmartLinkCreation(
      {
        source: 'track_query',
        artist: 'Tim White',
        title: 'Take Me Over',
      },
      sources({
        searchTracks: async () => [
          {
            provider: 'deezer',
            title: 'Take Me Over (Live)',
            artist: 'Tim White',
            url: 'https://www.deezer.com/track/77',
            isrc: null,
            upc: null,
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ],
      })
    );
    const missing = await resolveSmartLinkCreation(
      { source: 'track_url', url: 'https://www.deezer.com/track/1' },
      sources()
    );

    expect(choices).toMatchObject({ status: 'choices', retryable: false });
    expect(missing).toEqual({ status: 'not_found', retryable: false });
    expect(musicfetchRequest).not.toHaveBeenCalled();
  });
});
