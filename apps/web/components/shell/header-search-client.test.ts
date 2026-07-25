import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchHeaderLibraryAssets } from './header-search-client';

describe('searchHeaderLibraryAssets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests at most five results with the caller AbortSignal', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          releases: [
            {
              id: 'release-1',
              title: 'Midnight Drive',
              artistNames: ['Midnight Artist'],
              smartLinkPath: '/midnight-artist/midnight-drive',
              artworkUrl: 'must-not-survive',
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      searchHeaderLibraryAssets('midnight drive', controller.signal)
    ).resolves.toEqual([
      {
        id: 'release-1',
        title: 'Midnight Drive',
        artistNames: ['Midnight Artist'],
        smartLinkPath: '/midnight-artist/midnight-drive',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/search/header?q=midnight+drive&limit=5',
      {
        cache: 'no-store',
        signal: controller.signal,
      }
    );
  });

  it('rejects malformed or over-limit responses', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ releases: [{ id: 'missing-fields' }] }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            releases: Array.from({ length: 6 }, (_, index) => ({
              id: `release-${index}`,
              title: `Release ${index}`,
              artistNames: [],
              smartLinkPath: `/artist/release-${index}`,
            })),
          })
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      searchHeaderLibraryAssets('first', controller.signal)
    ).rejects.toThrow('invalid response');
    await expect(
      searchHeaderLibraryAssets('second', controller.signal)
    ).rejects.toThrow('invalid response');
  });
});
