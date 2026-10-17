import { describe, expect, it, vi } from 'vitest';
import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';
import {
  collectMusicBrainzCatalog,
  type MusicBrainzCatalogQuery,
} from './musicbrainz-catalog';

// Independent synthetic protocol fixtures, not a live artist/parity corpus.
const ARTIST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COLLABORATOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const groups = Array.from({ length: 27 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  title: index < 2 ? 'Same title, different identity' : `Catalog ${index}`,
  'first-release-date': ['2020', '2020-02', '2020-02-29'][index % 3],
  'primary-type': 'Single',
}));
const query: MusicBrainzCatalogQuery = {
  entity: 'release-group',
  by: 'artist',
  mbid: ARTIST,
  pageSize: 25,
};

function page(
  entity: MusicBrainzCatalogQuery['entity'],
  offset: number,
  items: unknown[],
  total = 27
) {
  return {
    [`${entity}-count`]: total,
    [`${entity}-offset`]: offset,
    [`${entity}s`]: items,
  };
}

describe('MusicBrainz catalog collection', () => {
  it.each([
    { entity: 'release-group', by: 'artist' },
    { entity: 'release', by: 'artist' },
    { entity: 'release', by: 'release-group' },
    { entity: 'recording', by: 'artist' },
    { entity: 'recording', by: 'release' },
  ] as const)(
    'collects every $entity by $by across 25 + 2 rows',
    async selector => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(page(selector.entity, 0, groups.slice(0, 25)))
        .mockResolvedValueOnce(page(selector.entity, 25, groups.slice(25)));
      const result = await collectMusicBrainzCatalog(
        { ...query, ...selector },
        request
      );
      expect(result).toMatchObject({
        source: 'musicbrainz',
        entity: selector.entity,
        by: selector.by,
        mbid: ARTIST,
        complete: true,
        total: 27,
        nextOffset: null,
        stopReason: 'complete',
      });
      expect(result.items).toEqual(groups);
      expect(
        request.mock.calls.map(([url]) =>
          new URL(`https://musicbrainz.org${url}`).searchParams.get('offset')
        )
      ).toEqual(['0', '25']);
      expect(request.mock.calls[0][0]).toContain(
        `/${selector.entity}?${selector.by}=${ARTIST}`
      );
      expect(
        result.pages.map(receipt => [receipt.offset, receipt.returned])
      ).toEqual([
        [0, 25],
        [25, 2],
      ]);
      expect(result.pages[1].sourceUrl).toContain('offset=25&fmt=json');
      expect(Number.isFinite(Date.parse(result.pages[1].observedAt))).toBe(
        true
      );
    }
  );

  it('advances short pages by actual rows and preserves partial date precision', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page('release-group', 0, groups.slice(0, 2), 3))
      .mockResolvedValueOnce(page('release-group', 2, groups.slice(2, 3), 3));
    const result = await collectMusicBrainzCatalog(query, request);
    expect(request.mock.calls[1][0]).toContain('offset=2');
    expect(result.items.map(item => item['first-release-date'])).toEqual([
      '2020',
      '2020-02',
      '2020-02-29',
    ]);
    expect(result.complete).toBe(true);
  });

  it('does not invent a continuation after the exact terminal page or an empty catalog', async () => {
    for (const items of [[], groups.slice(0, 25)]) {
      const request = vi
        .fn()
        .mockResolvedValue(page('release-group', 0, items, items.length));
      const result = await collectMusicBrainzCatalog(query, request);
      expect(result).toMatchObject({
        complete: true,
        total: items.length,
        nextOffset: null,
      });
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('reports budget exhaustion as incomplete, even for a short page', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(page('release-group', 0, groups.slice(0, 2)));
    const result = await collectMusicBrainzCatalog(
      { ...query, maxPages: 1 },
      request
    );
    expect(result).toMatchObject({
      complete: false,
      total: 27,
      nextOffset: 2,
      stopReason: 'page_budget',
    });
    expect(result.items).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps collaborators and regional release facts without claiming availability or retaining supplementary fields', async () => {
    const request = vi.fn().mockResolvedValue(
      page(
        'release',
        0,
        [
          {
            ...groups[0],
            country: 'JP',
            barcode: '1234567890123',
            date: '2020',
            'release-group': { ...groups[1], tags: [{ name: 'restricted' }] },
            'artist-credit': [
              {
                name: 'Primary',
                joinphrase: ' & ',
                artist: { id: ARTIST, name: 'Primary', genres: ['restricted'] },
              },
              {
                name: 'Collaborator',
                artist: { id: COLLABORATOR, name: 'Collaborator' },
              },
            ],
            tags: [{ name: 'restricted' }],
            genres: ['restricted'],
            rating: 5,
            biography: 'restricted',
            image: 'https://example.com/artwork',
          },
        ],
        1
      )
    );
    const result = await collectMusicBrainzCatalog(
      { ...query, entity: 'release', by: 'artist' },
      request
    );
    expect(result.items[0]).toMatchObject({
      country: 'JP',
      date: '2020',
      barcode: '1234567890123',
      'artist-credit': [
        { joinphrase: ' & ', artist: { id: ARTIST } },
        { artist: { id: COLLABORATOR } },
      ],
      'release-group': { id: groups[1].id },
    });
    expect(JSON.stringify(result)).not.toContain('restricted');
    expect(result.items[0]).not.toHaveProperty('image');
    expect(result).not.toHaveProperty('territory');
  });

  it('retains ISRCs and duration for recordings', async () => {
    const request = vi.fn().mockResolvedValue(
      page(
        'recording',
        0,
        [
          {
            id: groups[0].id,
            title: 'Recording (Remix)',
            length: 123000,
            isrcs: ['USABC1234567'],
          },
        ],
        1
      )
    );
    const result = await collectMusicBrainzCatalog(
      { ...query, entity: 'recording', by: 'artist' },
      request
    );
    expect(request.mock.calls[0][0]).toContain('inc=artist-credits+isrcs');
    expect(result.items[0]).toEqual({
      id: groups[0].id,
      title: 'Recording (Remix)',
      length: 123000,
      isrcs: ['USABC1234567'],
    });
  });

  it.each([
    null,
    {},
    { ...page('release-group', 0, [], 0), 'release-group-count': -1 },
    { ...page('release-group', 0, [], 0), 'release-group-count': 0.5 },
    {
      ...page('release-group', 0, [], 0),
      'release-group-count': Number.MAX_SAFE_INTEGER + 1,
    },
    { ...page('release-group', 0, [], 0), 'release-group-offset': '0' },
    page('release-group', 1, [], 0),
    page('release-group', 0, []),
    page('release-group', 0, groups.slice(0, 2), 1),
    page('release-group', 0, groups.slice(0, 26)),
    page('release-group', 0, [{ id: 'not-an-id', title: 'Bad' }], 1),
    page('release-group', 0, [{ id: groups[0].id, title: '  ' }], 1),
  ])(
    'rejects malformed/stalled page %# without an empty success',
    async payload => {
      const request = vi.fn().mockResolvedValue(payload);
      await expect(
        collectMusicBrainzCatalog(query, request)
      ).rejects.toMatchObject({ errorCode: 'INVALID_RESPONSE' });
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    page('release-group', 25, groups.slice(25), 28),
    page('release-group', 25, groups.slice(25), 26),
    page('release-group', 25, [groups[24], groups[26]]),
    page('release-group', 25, [
      { ...groups[24], title: 'Conflicting title' },
      groups[26],
    ]),
  ])(
    'rejects count drift and duplicate/conflicting identities %#',
    async second => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(page('release-group', 0, groups.slice(0, 25)))
        .mockResolvedValueOnce(second);
      await expect(
        collectMusicBrainzCatalog(query, request)
      ).rejects.toMatchObject({ errorCode: 'COLLECTION_CHANGED' });
    }
  );

  it('normalizes identity casing before duplicate detection', async () => {
    const request = vi.fn().mockResolvedValue(
      page(
        'release-group',
        0,
        [
          { id: ARTIST, title: 'Original' },
          { id: ARTIST.toUpperCase(), title: 'Original' },
        ],
        2
      )
    );
    await expect(
      collectMusicBrainzCatalog(query, request)
    ).rejects.toMatchObject({ errorCode: 'COLLECTION_CHANGED' });
  });

  it.each([
    { mbid: '../artist/wrong' },
    { maxPages: 0 },
    { maxPages: 101 },
    { maxPages: 1.5 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 2.5 },
    { entity: 'release-group', by: 'release' },
  ])('rejects invalid options %# before acquisition', async invalid => {
    const request = vi.fn();
    // Exercise the runtime trust boundary, including callers outside TypeScript.
    await expect(
      collectMusicBrainzCatalog(
        { ...query, ...invalid } as MusicBrainzCatalogQuery,
        request
      )
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('uses bounded defaults and a canonical lowercase linked identity', async () => {
    const request = vi.fn().mockResolvedValue(page('release-group', 0, [], 0));
    const result = await collectMusicBrainzCatalog(
      { entity: 'release-group', by: 'artist', mbid: ARTIST.toUpperCase() },
      request
    );
    expect(result.mbid).toBe(ARTIST);
    expect(request.mock.calls[0][0]).toContain(
      `artist=${ARTIST}&inc=artist-credits&limit=100&offset=0`
    );
  });

  it('propagates a midstream provider failure instead of returning partial success', async () => {
    const failure = new Error('upstream unavailable');
    const request = vi
      .fn()
      .mockResolvedValueOnce(page('release-group', 0, groups.slice(0, 25)))
      .mockRejectedValueOnce(failure);
    await expect(collectMusicBrainzCatalog(query, request)).rejects.toBe(
      failure
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation before acquisition and after an in-flight page', async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => {
      controller.abort();
      return page('release-group', 0, [], 0);
    });
    await expect(
      collectMusicBrainzCatalog(
        { ...query, signal: controller.signal },
        request
      )
    ).rejects.toBeInstanceOf(CallerCancellationError);
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    await expect(
      collectMusicBrainzCatalog(
        { ...query, signal: controller.signal },
        request
      )
    ).rejects.toBeInstanceOf(CallerCancellationError);
    expect(request).not.toHaveBeenCalled();
  });
});
