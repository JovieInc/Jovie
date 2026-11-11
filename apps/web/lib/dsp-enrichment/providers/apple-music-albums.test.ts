import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./apple-music-auth', () => ({
  clearAppleMusicTokenCache: vi.fn(),
  getAppleMusicAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer t' })),
  isAppleMusicConfigured: () => true,
}));

import { getArtistAlbums } from './apple-music';

const page = (ids: string[], next?: string) =>
  new Response(JSON.stringify({ data: ids.map(id => ({ id })), next }));

describe('getArtistAlbums', () => {
  it('returns every page of a large discography', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page(['a', 'b'], '/v1/catalog/us/artists/9/albums?offset=2')
      )
      .mockResolvedValueOnce(page(['c']));

    const albums = await getArtistAlbums('9', { fetcher }, 2);

    expect(albums.map(a => a.id)).toEqual(['a', 'b', 'c']);
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://api.music.apple.com/v1/catalog/us/artists/9/albums?offset=2&limit=2'
    );
  });

  it('stops at the page cap when the cursor never ends', async () => {
    const fetcher = vi.fn(async () =>
      page(['x'], '/v1/catalog/us/artists/9/albums?offset=1')
    );

    const albums = await getArtistAlbums('9', { fetcher }, 1);

    expect(fetcher).toHaveBeenCalledTimes(10);
    expect(albums).toHaveLength(10);
  });
});
