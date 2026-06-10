import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  countLibrarySavedViewMatches,
  getLibrarySavedViewPredicate,
  isLibrarySavedViewId,
  LIBRARY_SAVED_VIEW_STORAGE_KEY,
  persistLibrarySavedView,
  readPersistedLibrarySavedView,
} from '@/app/app/(shell)/library/library-saved-views';

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    previewUrl: 'https://cdn.example.com/preview.mp3',
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    trackCount: 1,
    providerCount: 1,
    providers: [
      {
        key: 'spotify',
        label: 'Spotify',
        url: 'https://open.spotify.com/album/take-me-over',
      },
    ],
    hasLyrics: true,
    hasArtwork: true,
    hasVideoLinks: false,
    assetKinds: ['artwork', 'preview', 'lyrics', 'providers'],
    genres: [],
    spotifyPopularity: null,
    targetPlaylistCount: 0,
    isExplicit: false,
    label: null,
    upc: null,
    distributor: null,
    totalDurationMs: null,
    ...overrides,
  };
}

describe('library saved views', () => {
  it('recognizes canonical smart filter ids', () => {
    expect(isLibrarySavedViewId('missing-audio')).toBe(true);
    expect(isLibrarySavedViewId('unknown-view')).toBe(false);
  });

  it('matches missing audio and no-provider smart filters', () => {
    const missingAudio = getLibrarySavedViewPredicate('missing-audio');
    const noProviders = getLibrarySavedViewPredicate('no-providers');

    expect(
      missingAudio(
        buildAsset({
          previewUrl: null,
          assetKinds: ['artwork', 'lyrics', 'providers'],
        })
      )
    ).toBe(true);
    expect(missingAudio(buildAsset())).toBe(false);
    expect(noProviders(buildAsset({ providerCount: 0, providers: [] }))).toBe(
      true
    );
    expect(noProviders(buildAsset())).toBe(false);
  });

  it('counts smart filter matches across the catalog', () => {
    const assets = [
      buildAsset(),
      buildAsset({
        id: 'release-2',
        previewUrl: null,
        assetKinds: ['artwork', 'lyrics', 'providers'],
      }),
      buildAsset({
        id: 'merch-1',
        itemKind: 'merch',
        status: 'released',
        providerCount: 0,
        providers: [],
      }),
    ];

    expect(countLibrarySavedViewMatches(assets, 'missing-audio')).toBe(1);
    expect(countLibrarySavedViewMatches(assets, 'live-merch')).toBe(1);
  });

  it('persists the selected smart filter in localStorage', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });

    persistLibrarySavedView('missing-audio');
    expect(readPersistedLibrarySavedView()).toBe('missing-audio');
    expect(storage.get(LIBRARY_SAVED_VIEW_STORAGE_KEY)).toBe('missing-audio');

    persistLibrarySavedView('all');
    expect(readPersistedLibrarySavedView()).toBe('all');
    expect(storage.has(LIBRARY_SAVED_VIEW_STORAGE_KEY)).toBe(false);
  });
});
