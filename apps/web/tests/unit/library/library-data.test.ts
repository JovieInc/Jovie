import { describe, expect, it } from 'vitest';
import {
  buildLibraryReleaseAssets,
  formatLibraryReleaseDate,
} from '@/app/app/(shell)/dashboard/library/library-data';
import type { ReleaseViewModel } from '@/lib/discography/types';

function buildRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Test Release',
    artistNames: ['Test Artist'],
    status: 'released',
    artworkUrl: 'https://example.com/art.jpg',
    slug: 'test-release',
    smartLinkPath: '/artist/test-release',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...overrides,
  };
}

describe('library data', () => {
  it('derives read-only assets from release view models', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({
        lyrics: 'Stored lyrics',
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com/album/test',
            source: 'ingested',
            updatedAt: '2026-01-01T00:00:00.000Z',
            path: '/artist/test-release/spotify',
            isPrimary: true,
          },
        ],
      }),
    ]);

    expect(assets).toEqual([
      {
        id: 'release-1',
        title: 'Test Release',
        artist: 'Test Artist',
        artworkUrl: 'https://example.com/art.jpg',
        smartLinkPath: '/artist/test-release',
        releaseDate: null,
        releaseType: 'single',
        status: 'released',
        trackCount: 1,
        providerCount: 1,
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com/album/test',
          },
        ],
        hasLyrics: true,
      },
    ]);
  });

  it('formats release dates without local timezone drift', () => {
    expect(formatLibraryReleaseDate('2026-04-28T00:00:00.000Z')).toBe(
      'Apr 28, 2026'
    );
    expect(formatLibraryReleaseDate(null)).toBe('No Release Date');
  });
});
