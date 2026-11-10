import { describe, expect, it } from 'vitest';
import {
  buildDuplicateReport,
  type DuplicateReportRelease,
  providerIdFromUrl,
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
    ...overrides,
  };
}

function spotify(urlId: string): DuplicateReportRelease['providers'] {
  return [{ key: 'spotify', url: `https://open.spotify.com/album/${urlId}` }];
}

describe('providerIdFromUrl', () => {
  it('extracts the album id segment and ignores query/hash', () => {
    expect(
      providerIdFromUrl('https://open.spotify.com/album/1a2b3c?si=x')
    ).toBe('1a2b3c');
    expect(
      providerIdFromUrl('https://music.apple.com/us/album/night-drive/1234567')
    ).toBe('1234567');
    expect(providerIdFromUrl('https://open.spotify.com/album/')).toBeNull();
    expect(providerIdFromUrl('not a url')).toBeNull();
  });
});

describe('buildDuplicateReport', () => {
  it('keeps same-title releases separate when no hard identifier collides', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-solo',
          title: 'Midnight City',
          providers: spotify('solo111'),
        }),
        release({
          id: 'rel-collab',
          title: 'Midnight City',
          releaseDate: '2026-06-01',
          providers: spotify('collab222'),
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
          providers: spotify('same123'),
        }),
        release({
          id: 'rel-b',
          profileId: 'profile-b',
          providers: spotify('same123'),
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

  it('reports an exact provider-id collision as a candidate with both releases intact', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-ingested',
          slug: 'night-drive',
          providers: spotify('dup999'),
          tracks: [{ id: 'trk-1', title: 'Night Drive', isrc: 'USRC17607839' }],
          dependents: { smart_links: 2 },
        }),
        release({
          id: 'rel-manual',
          slug: 'night-drive-2',
          title: 'Night Drive (Manual)',
          releaseDate: '2026-05-02',
          providers: spotify('dup999'),
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

  it('reports an exact UPC collision even when provider ids differ', () => {
    const report = buildDuplicateReport({
      releases: [
        release({
          id: 'rel-a',
          upc: ' 0190296000999 ',
          providers: spotify('aaa111'),
        }),
        release({
          id: 'rel-b',
          upc: '0190296000999',
          providers: spotify('bbb222'),
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

  it('shows lifecycle without hiding deleted rows and is deterministic', () => {
    const input = {
      releases: [
        release({
          id: 'rel-old',
          deletedAt: '2026-04-01T00:00:00.000Z',
          providers: spotify('gone111'),
        }),
        release({ id: 'rel-live', providers: spotify('gone111') }),
      ],
    };

    const first = buildDuplicateReport(input);
    const second = buildDuplicateReport(input);

    expect(first).toEqual(second);
    expect(first.groups[0].releases.map(r => r.lifecycle)).toEqual([
      'active',
      'deleted',
    ]);
    expect(first.groups[0].conflictingEvidence).toEqual([
      { field: 'lifecycle', values: ['active', 'deleted'] },
    ]);
  });
});
