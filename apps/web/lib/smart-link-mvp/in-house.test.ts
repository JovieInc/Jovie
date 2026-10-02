import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/discography/provider-links', () => ({
  lookupAppleMusicByIsrc: vi.fn(async () => null),
  lookupSpotifyByIsrc: vi.fn(async () => null),
}));

vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: () => false,
  spotifyClient: { requestJson: vi.fn() },
}));

import { lookupSpotifyByIsrc } from '@/lib/discography/provider-links';
import { resolveInHouseIsrc, searchInHouseTracks } from './in-house';

const APPLE = {
  resultCount: 2,
  results: [
    {
      trackId: 1256607810,
      trackName: 'Motion Sickness',
      artistName: 'Phoebe Bridgers',
      trackViewUrl:
        'https://music.apple.com/us/album/motion-sickness/1256607808?i=1256607810&uo=4',
      artworkUrl100:
        'https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg',
    },
    {
      trackId: 1436646805,
      trackName: 'Motion Sickness (Demo - Bonus Track)',
      artistName: 'Phoebe Bridgers',
      trackViewUrl:
        'https://music.apple.com/us/album/motion-sickness-demo/1436646549?i=1436646805',
      artworkUrl100:
        'https://is1-ssl.mzstatic.com/image/thumb/Music/y/100x100bb.jpg',
    },
  ],
};

const DEEZER = {
  data: [
    {
      id: 384037361,
      title: 'Motion Sickness',
      link: 'https://www.deezer.com/track/384037361',
      isrc: 'USJ5G1714202',
      artist: { name: 'Phoebe Bridgers' },
      album: {
        cover_xl:
          'https://cdn-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg',
      },
    },
    {
      id: 999,
      title: 'Motion Sickness',
      link: 'https://www.deezer.com/track/999',
      artist: { name: 'Midnite String Quartet' },
    },
  ],
};

describe('in-house track search', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (
          url.includes('itunes.apple.com/search') &&
          url.includes('Radiohead')
        ) {
          return new Response(
            JSON.stringify({
              resultCount: 1,
              results: [
                {
                  trackId: 1,
                  trackName: 'Creep (Acoustic)',
                  artistName: 'Radiohead',
                  trackViewUrl:
                    'https://music.apple.com/us/song/creep-acoustic/1',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes('itunes.apple.com/search')) {
          return new Response(JSON.stringify(APPLE), { status: 200 });
        }
        if (
          url.includes('api.deezer.com/search') &&
          url.includes('Radiohead')
        ) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (url.includes('api.deezer.com/search')) {
          return new Response(JSON.stringify(DEEZER), { status: 200 });
        }
        if (url.includes('api.deezer.com/track/isrc:')) {
          return new Response(JSON.stringify(DEEZER.data[0]), { status: 200 });
        }
        return new Response('no', { status: 404 });
      })
    );
  });

  it('auto-selects the exact recording and drops a different artist', async () => {
    const result = await searchInHouseTracks(
      'Phoebe Bridgers - Motion Sickness'
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: 'Motion Sickness',
        artist: 'Phoebe Bridgers',
        url: 'https://music.apple.com/us/album/motion-sickness/1256607808?i=1256607810',
      }),
    ]);
  });

  it('offers the remix instead of saving it as the original', async () => {
    const result = await searchInHouseTracks('Radiohead - Creep');
    expect(result).toEqual({
      status: 'ok',
      candidates: [
        expect.objectContaining({
          name: 'Creep (Acoustic)',
          artist: 'Radiohead',
        }),
      ],
    });
  });

  it('resolves an ISRC through Deezer without MusicFetch', async () => {
    const release = await resolveInHouseIsrc('USJ5G1714202');
    expect(release?.isrc).toBe('USJ5G1714202');
    expect(release?.providers.map(provider => provider.key).sort()).toEqual([
      'apple_music',
      'deezer',
    ]);
    expect(release?.title).toBe('Motion Sickness');
    expect(release?.artist).toBe('Phoebe Bridgers');
    expect(lookupSpotifyByIsrc).not.toHaveBeenCalled();
  });
});
