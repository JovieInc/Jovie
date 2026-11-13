import { describe, expect, it } from 'vitest';
import {
  buildDuplicateReport,
  type DuplicateReportRelease,
  providerAlbumId,
} from './release-duplicate-report';

function release(
  overrides: Partial<DuplicateReportRelease>
): DuplicateReportRelease {
  return {
    id: 'rel-1',
    profileId: 'profile-a',
    slug: 'night-drive',
    title: 'Night Drive',
    releaseDate: '2026-05-01',
    upc: null,
    deletedAt: null,
    providers: [],
    tracks: [],
    dependents: {},
    ...overrides,
  };
}

function spotifyAlbum(urlId: string): DuplicateReportRelease['providers'] {
  return [{ key: 'spotify', url: `https://open.spotify.com/album/${urlId}` }];
}

describe('providerAlbumId', () => {
  it('treats inherited object names as unknown providers', () => {
    for (const key of ['constructor', '__proto__', 'toString']) {
      expect(providerAlbumId(key, 'https://example.com/no-album')).toBeNull();
    }
  });

  it('extracts the id from valid album routes, tolerating query/hash/trailing slash', () => {
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/album/1a2b3c?si=x')
    ).toBe('1a2b3c');
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/album/1a2b3c/')
    ).toBe('1a2b3c');
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/album/1a2b3c#disc')
    ).toBe('1a2b3c');
    expect(
      providerAlbumId(
        'apple_music',
        'https://music.apple.com/us/album/night-drive/1234567'
      )
    ).toBe('1234567');
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/album/9z8y7x')
    ).toBe('9z8y7x');
  });

  it('never extracts an id from search, artist or track links', () => {
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/search?q=one')
    ).toBeNull();
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/search?q=two')
    ).toBeNull();
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/artist/abc123')
    ).toBeNull();
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/track/abc123')
    ).toBeNull();
  });

  it('rejects host/provider mismatch even when the path looks like an album', () => {
    expect(
      providerAlbumId('apple_music', 'https://open.spotify.com/album/1a2b3c')
    ).toBeNull();
    expect(
      providerAlbumId('spotify', 'https://music.apple.com/us/album/1234567')
    ).toBeNull();
    expect(
      providerAlbumId('unknown_provider', 'https://example.com/album/1a2b3c')
    ).toBeNull();
    expect(providerAlbumId('spotify', 'not a url')).toBeNull();
    expect(
      providerAlbumId('spotify', 'https://open.spotify.com/album/')
    ).toBeNull();
  });
});

describe('buildDuplicateReport', () => {
  it('keeps same-title releases separate when no hard identifier collides', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-solo',
          title: 'Midnight City',
          providers: spotifyAlbum('solo111'),
        }),
        release({
          id: 'rel-collab',
          title: 'Midnight City',
          releaseDate: '2026-06-01',
          providers: spotifyAlbum('collab222'),
        }),
      ],
    });

    expect(report.groups).toEqual([]);
    expect(report.groupsByKind).toEqual({
      'provider-album-id': 0,
      upc: 0,
    });
  });

  it('never groups matches across different profiles', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-a',
          profileId: 'profile-a',
          providers: spotifyAlbum('same123'),
        }),
        release({
          id: 'rel-b',
          profileId: 'profile-b',
          providers: spotifyAlbum('same123'),
        }),
      ],
    });

    expect(report.groups).toEqual([]);
    expect(report.profileCount).toBe(2);
  });

  it('does not merge releases that share a recording ISRC', () => {
    const sharedIsrc = 'USRC17607839';
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-single',
          title: 'Horizon',
          tracks: [{ id: 'trk-1', title: 'Horizon', isrc: sharedIsrc }],
        }),
        release({
          id: 'rel-album',
          title: 'Horizon (Deluxe Edition)',
          releaseDate: '2026-09-01',
          upc: '0190296000123',
          tracks: [{ id: 'trk-2', title: 'Horizon', isrc: sharedIsrc }],
        }),
      ],
    });

    expect(report.groups).toEqual([]);
  });

  it('does not group releases whose only overlap is a non-album URL suffix', () => {
    // Same suffix "abc123" on a track page vs an album page, and identical
    // search links with different queries: none of these are album ids.
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-track-link',
          providers: [
            { key: 'spotify', url: 'https://open.spotify.com/track/abc123' },
          ],
        }),
        release({
          id: 'rel-album-link',
          providers: [
            { key: 'spotify', url: 'https://open.spotify.com/album/abc123' },
          ],
        }),
        release({
          id: 'rel-search-one',
          providers: [
            { key: 'spotify', url: 'https://open.spotify.com/search?q=one' },
          ],
        }),
        release({
          id: 'rel-search-two',
          providers: [
            { key: 'spotify', url: 'https://open.spotify.com/search?q=two' },
          ],
        }),
      ],
    });

    expect(report.groups).toEqual([]);
  });

  it('reports an exact provider-id collision as a candidate with both releases intact', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-ingested',
          slug: 'night-drive',
          providers: spotifyAlbum('dup999'),
          tracks: [{ id: 'trk-1', title: 'Night Drive', isrc: 'USRC17607839' }],
          dependents: { smart_links: 2 },
        }),
        release({
          id: 'rel-manual',
          slug: 'night-drive-2',
          title: 'Night Drive (Manual)',
          releaseDate: '2026-05-02',
          providers: spotifyAlbum('dup999'),
          tracks: [
            { id: 'trk-2', title: 'Night Drive', isrc: 'USRC17607840' },
            { id: 'trk-3', title: 'B Side', isrc: null },
          ],
          dependents: { smart_links: 1 },
        }),
      ],
    });

    expect(report.groups).toHaveLength(1);
    const group = report.groups[0];
    expect(group.kind).toBe('provider-album-id');
    expect(group.key).toBe('spotify:dup999');
    expect(group.profileId).toBe('profile-a');
    // Both releases stay fully inventoried — nothing is pruned or marked for
    // deletion. The report is a candidate list, not an action.
    expect(group.releases.map(r => r.id)).toEqual([
      'rel-ingested',
      'rel-manual',
    ]);
    expect(group.disposition).toBe('candidate');
    // Full track identity is preserved for cleanup review.
    expect(group.releases[0].tracks).toEqual([
      { id: 'trk-1', title: 'Night Drive', isrc: 'USRC17607839' },
    ]);
    expect(group.releases[1].tracks).toEqual([
      { id: 'trk-2', title: 'Night Drive', isrc: 'USRC17607840' },
      { id: 'trk-3', title: 'B Side', isrc: null },
    ]);
    expect(group.conflictingEvidence).toEqual([
      {
        field: 'title',
        values: ['Night Drive', 'Night Drive (Manual)'],
      },
      { field: 'releaseDate', values: ['2026-05-01', '2026-05-02'] },
      { field: 'slug', values: ['night-drive', 'night-drive-2'] },
    ]);
    expect(group.dependentInventory).toEqual({
      totalTracks: 3,
      totalProviderLinks: 2,
      byResource: { smart_links: 3 },
    });
  });

  it('sums all exported dependent names without inherited dictionary entries', () => {
    const dependents = JSON.parse('{"constructor":2,"__proto__":3}');
    const report = buildDuplicateReport({
      releases: [
        release({ id: 'a', upc: '123', dependents }),
        release({ id: 'b', upc: '123', dependents }),
      ],
    });
    expect(JSON.stringify(report.groups[0].dependentInventory.byResource)).toBe(
      '{"constructor":4,"__proto__":6}'
    );
  });

  it('reports an exact UPC collision even when provider ids differ', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-a',
          upc: ' 0190296000999 ',
          providers: spotifyAlbum('aaa111'),
        }),
        release({
          id: 'rel-b',
          upc: '0190296000999',
          providers: spotifyAlbum('bbb222'),
        }),
      ],
    });

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].kind).toBe('upc');
    expect(report.groups[0].key).toBe('0190296000999');
    expect(report.groups[0].releases.map(r => r.id)).toEqual([
      'rel-a',
      'rel-b',
    ]);
  });

  it('distinguishes not-exported tracks/dependents from confirmed zero', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-no-tracks-exported',
          providers: spotifyAlbum('dup999'),
          tracks: undefined,
          dependents: undefined,
        }),
        release({
          id: 'rel-confirmed-zero',
          providers: spotifyAlbum('dup999'),
          tracks: [],
          dependents: {},
        }),
      ],
    });

    expect(report.groups).toHaveLength(1);
    const group = report.groups[0];
    // Sorted by release id: rel-confirmed-zero first, rel-no-tracks-exported second.
    expect(group.releases[0].tracks).toEqual([]);
    expect(group.releases[0].dependents).toEqual({});
    expect(group.releases[1].tracks).toBeNull();
    expect(group.releases[1].dependents).toBeNull();
    // Sums over incomplete data would understate the inventory, so they stay
    // null; the fully-exported side still sums its own zeros.
    expect(group.dependentInventory.totalTracks).toBeNull();
    expect(group.dependentInventory.byResource).toBeNull();
  });

  it('shows lifecycle without hiding deleted rows', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-old',
          deletedAt: '2026-04-01T00:00:00.000Z',
          providers: spotifyAlbum('gone111'),
        }),
        release({ id: 'rel-live', providers: spotifyAlbum('gone111') }),
      ],
    });

    expect(report.groups[0].releases.map(r => r.lifecycle)).toEqual([
      'active',
      'deleted',
    ]);
    expect(report.groups[0].conflictingEvidence).toEqual([
      { field: 'lifecycle', values: ['active', 'deleted'] },
    ]);
  });

  it('is deterministic and independent of input order', () => {
    const releases = [
      release({ id: 'rel-b', providers: spotifyAlbum('dup999') }),
      release({ id: 'rel-a', providers: spotifyAlbum('dup999') }),
      release({ id: 'rel-c', providers: spotifyAlbum('other777') }),
    ];
    const ordered = buildDuplicateReport({ releases });
    const shuffled = buildDuplicateReport({
      releases: [...releases].reverse(),
    });

    expect(shuffled).toEqual(ordered);
    // The colliding pair is ordered by release id regardless of input order.
    expect(ordered.groups[0].releases.map(r => r.id)).toEqual([
      'rel-a',
      'rel-b',
    ]);
  });
});
