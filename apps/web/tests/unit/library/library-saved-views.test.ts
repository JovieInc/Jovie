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
    expect(isLibrarySavedViewId('needs-attention')).toBe(true);
    expect(isLibrarySavedViewId('missing-audio')).toBe(false);
    expect(isLibrarySavedViewId('unknown-view')).toBe(false);
  });

  it('matches the consolidated needs-attention smart filter', () => {
    const needsAttention = getLibrarySavedViewPredicate('needs-attention');

    // Release missing audio.
    expect(
      needsAttention(
        buildAsset({
          previewUrl: null,
          assetKinds: ['artwork', 'lyrics', 'providers'],
        })
      )
    ).toBe(true);
    // Release without DSP links.
    expect(
      needsAttention(buildAsset({ providerCount: 0, providers: [] }))
    ).toBe(true);
    // Anything missing artwork.
    expect(
      needsAttention(buildAsset({ artworkUrl: null, hasArtwork: false }))
    ).toBe(true);
    // Fully-loaded release is fine.
    expect(needsAttention(buildAsset())).toBe(false);
    // Merch with artwork never needs audio/providers attention.
    expect(
      needsAttention(buildAsset({ id: 'merch-1', itemKind: 'merch' }))
    ).toBe(false);
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

    expect(countLibrarySavedViewMatches(assets, 'needs-attention')).toBe(1);
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

    persistLibrarySavedView('needs-attention');
    expect(readPersistedLibrarySavedView()).toBe('needs-attention');
    expect(storage.get(LIBRARY_SAVED_VIEW_STORAGE_KEY)).toBe('needs-attention');

    persistLibrarySavedView('all');
    expect(readPersistedLibrarySavedView()).toBe('all');
    expect(storage.has(LIBRARY_SAVED_VIEW_STORAGE_KEY)).toBe(false);
  });
});
