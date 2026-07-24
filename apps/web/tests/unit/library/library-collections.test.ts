import { describe, expect, it, vi } from 'vitest';
import {
  assetMatchesLibraryCollectionFilters,
  countLibraryCollectionMatches,
  createLibraryCollection,
  deleteLibraryCollection,
  emptyLibraryCollectionFilters,
  LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY,
  LIBRARY_COLLECTIONS_STORAGE_KEY,
  libraryCollectionFiltersAreEmpty,
  persistActiveLibraryCollectionId,
  persistLibraryCollections,
  readPersistedActiveLibraryCollectionId,
  readPersistedLibraryCollections,
  renameLibraryCollection,
  summarizeLibraryCollectionFilters,
  upsertLibraryCollection,
} from '@/app/app/(shell)/library/library-collections';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    previewUrl: 'https://cdn.example.com/preview.mp3',
    videoUrl: null,
    waveformSeed: 17,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    approvalStatus: 'draft',
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
    genres: ['Progressive House'],
    spotifyPopularity: 68,
    targetPlaylistCount: 2,
    isExplicit: false,
    label: 'Jovie',
    upc: '123456789012',
    distributor: null,
    totalDurationMs: 210_000,
    ...overrides,
  };
}

function stubLocalStorage() {
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
  return storage;
}

describe('library collections', () => {
  it('treats empty filter snapshots as not savable', () => {
    expect(
      libraryCollectionFiltersAreEmpty(emptyLibraryCollectionFilters())
    ).toBe(true);
    expect(
      createLibraryCollection({
        name: 'Empty',
        filters: emptyLibraryCollectionFilters(),
      })
    ).toBeNull();
  });

  it('requires a non-empty name', () => {
    expect(
      createLibraryCollection({
        name: '   ',
        filters: { ...emptyLibraryCollectionFilters(), statuses: ['draft'] },
      })
    ).toBeNull();
  });

  it('creates a named collection from metadata filters without moving assets', () => {
    const collection = createLibraryCollection({
      name: '  Summer Release  ',
      filters: {
        statuses: ['scheduled'],
        approvalStatuses: ['needs_review'],
        releaseTypes: ['single'],
        assetKinds: ['preview'],
        releaseTags: ['Jovie'],
      },
      viewMode: 'grid',
      now: new Date('2026-07-21T12:00:00.000Z'),
    });

    expect(collection).not.toBeNull();
    expect(collection?.name).toBe('Summer Release');
    expect(collection?.viewMode).toBe('grid');
    expect(collection?.filters.statuses).toEqual(['scheduled']);
    expect(collection?.filters.approvalStatuses).toEqual(['needs_review']);
    expect(collection?.filters.releaseTags).toEqual(['Jovie']);
    expect(collection?.id.startsWith('col_')).toBe(true);
  });

  it('auto-populates matches from status, approval, asset type, and release tag', () => {
    const assets = [
      buildAsset({
        id: 'a',
        status: 'scheduled',
        approvalStatus: 'needs_review',
        assetKinds: ['preview', 'artwork'],
        label: 'Jovie',
        genres: [],
      }),
      buildAsset({
        id: 'b',
        status: 'released',
        approvalStatus: 'approved',
        assetKinds: ['artwork'],
        label: 'Other',
        genres: ['Techno'],
      }),
      buildAsset({
        id: 'c',
        status: 'scheduled',
        approvalStatus: 'needs_review',
        assetKinds: ['lyrics'],
        label: null,
        genres: ['Progressive House'],
      }),
    ];

    const filters = {
      statuses: ['scheduled'] as const,
      approvalStatuses: ['needs_review'] as const,
      releaseTypes: [] as const,
      assetKinds: ['preview'] as const,
      releaseTags: ['jovie'] as const,
    };

    expect(assetMatchesLibraryCollectionFilters(assets[0]!, filters)).toBe(
      true
    );
    expect(assetMatchesLibraryCollectionFilters(assets[1]!, filters)).toBe(
      false
    );
    expect(assetMatchesLibraryCollectionFilters(assets[2]!, filters)).toBe(
      false
    );
    expect(countLibraryCollectionMatches(assets, filters)).toBe(1);
  });

  it('matches release tags from label or genres case-insensitively', () => {
    const asset = buildAsset({
      label: null,
      genres: ['Progressive House'],
    });
    expect(
      assetMatchesLibraryCollectionFilters(asset, {
        ...emptyLibraryCollectionFilters(),
        releaseTags: ['progressive house'],
      })
    ).toBe(true);
  });

  it('persists collections and active selection in localStorage', () => {
    const storage = stubLocalStorage();
    const collection = createLibraryCollection({
      name: 'Needs Review Art',
      filters: {
        ...emptyLibraryCollectionFilters(),
        approvalStatuses: ['needs_review'],
        assetKinds: ['artwork'],
      },
    });
    expect(collection).not.toBeNull();

    persistLibraryCollections([collection!]);
    persistActiveLibraryCollectionId(collection!.id);

    expect(storage.get(LIBRARY_COLLECTIONS_STORAGE_KEY)).toContain(
      'Needs Review Art'
    );
    expect(storage.get(LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY)).toBe(
      collection!.id
    );
    expect(readPersistedLibraryCollections()).toHaveLength(1);
    expect(readPersistedActiveLibraryCollectionId()).toBe(collection!.id);

    persistActiveLibraryCollectionId(null);
    persistLibraryCollections([]);
    expect(storage.has(LIBRARY_ACTIVE_COLLECTION_STORAGE_KEY)).toBe(false);
    expect(storage.has(LIBRARY_COLLECTIONS_STORAGE_KEY)).toBe(false);
  });

  it('upserts, renames, and deletes without mutating source arrays', () => {
    const first = createLibraryCollection({
      name: 'First',
      filters: { ...emptyLibraryCollectionFilters(), statuses: ['draft'] },
    })!;
    const second = createLibraryCollection({
      name: 'Second',
      filters: { ...emptyLibraryCollectionFilters(), statuses: ['released'] },
    })!;

    const withBoth = upsertLibraryCollection(
      upsertLibraryCollection([], first),
      second
    );
    expect(withBoth).toHaveLength(2);

    const renamed = renameLibraryCollection(
      withBoth,
      first.id,
      '  Renamed  ',
      new Date('2026-07-21T13:00:00.000Z')
    );
    expect(renamed.find(item => item.id === first.id)?.name).toBe('Renamed');
    expect(withBoth.find(item => item.id === first.id)?.name).toBe('First');

    const deleted = deleteLibraryCollection(renamed, second.id);
    expect(deleted.map(item => item.id)).toEqual([first.id]);
  });

  it('summarizes filter criteria for the create form', () => {
    expect(
      summarizeLibraryCollectionFilters({
        statuses: ['draft'],
        approvalStatuses: ['needs_review'],
        releaseTypes: ['ep'],
        assetKinds: ['video'],
        releaseTags: ['Jovie'],
      })
    ).toBe(
      'Status: draft · Approval: needs_review · Type: ep · Assets: video · Tag: Jovie'
    );
    expect(
      summarizeLibraryCollectionFilters(emptyLibraryCollectionFilters())
    ).toBe('No filters');
  });

  it('ignores corrupt localStorage payloads', () => {
    const storage = stubLocalStorage();
    storage.set(LIBRARY_COLLECTIONS_STORAGE_KEY, '{not-json');
    expect(readPersistedLibraryCollections()).toEqual([]);

    storage.set(
      LIBRARY_COLLECTIONS_STORAGE_KEY,
      JSON.stringify([{ id: 'x', name: '', filters: null }])
    );
    expect(readPersistedLibraryCollections()).toEqual([]);
  });
});
