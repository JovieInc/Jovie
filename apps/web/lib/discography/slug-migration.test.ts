import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  inserts: [] as unknown[],
  updates: [] as unknown[],
  updateFails: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: h.revalidateTag }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ db: {} }));

import {
  migrateLegacySlugsForProfile,
  sweepLegacySlugsForCron,
} from './slug-migration';

type Rows = Record<string, unknown>[];

/**
 * Fake drizzle connection: every select chain resolves to the next queued
 * result, in the order the module builds its queries.
 */
function fakeConn(selects: Rows[]) {
  const queue = [...selects];
  const chain = (): unknown => {
    const rows = queue.shift() ?? [];
    const node: Record<string, unknown> = {};
    for (const step of [
      'from',
      'where',
      'innerJoin',
      'groupBy',
      'orderBy',
      'limit',
    ]) {
      node[step] = () => node;
    }
    node.then = (resolve: (v: Rows) => unknown) => resolve(rows);
    return node;
  };
  return {
    select: () => chain(),
    insert: () => ({
      values: (v: unknown) => {
        h.inserts.push(v);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: () => ({
          returning: async () => {
            h.updates.push(v);
            return h.updateFails ? [] : [{ id: 'x' }];
          },
        }),
      }),
    }),
  } as never;
}

const PROFILE = 'profile-tim';

// Query order in migrateLegacySlugsForProfile: releases, co-primary credits,
// deleted release slugs, recording slugs, legacy track slugs, redirect slugs,
// release tracks.
function timCatalog(): Rows[] {
  return [
    [
      {
        id: 'rel-tmo',
        title: 'Take Me Over',
        slug: 'take-me-over-2',
        releaseDate: new Date('2014-05-06T00:00:00Z'),
        popularity: 10,
      },
      {
        id: 'rel-sober',
        title: 'Sober',
        slug: 'sober',
        releaseDate: new Date('2016-11-07T00:00:00Z'),
        popularity: 5,
      },
      {
        id: 'rel-seaside',
        title: 'Seaside Heights',
        slug: 'seaside-heights-3',
        releaseDate: new Date('2019-09-20T00:00:00Z'),
        popularity: 3,
      },
    ],
    [],
    [{ slug: 'seaside-heights' }],
    [{ slug: 'sober-2' }, { slug: 'take-me-over-3' }],
    [],
    [],
    [
      {
        id: 'rt-sober',
        releaseId: 'rel-sober',
        title: 'Sober',
        slug: 'sober-2',
      },
      {
        id: 'rt-tmo',
        releaseId: 'rel-tmo',
        title: 'Take Me Over',
        slug: 'take-me-over-3',
      },
    ],
  ];
}

describe('migrateLegacySlugsForProfile', () => {
  beforeEach(() => {
    h.inserts = [];
    h.updates = [];
    h.updateFails = false;
    h.revalidateTag.mockReset();
  });

  it("renames Tim's legacy URLs and keeps every old release URL redirecting", async () => {
    const result = await migrateLegacySlugsForProfile(
      PROFILE,
      fakeConn(timCatalog())
    );

    expect(result).toEqual({
      profileId: PROFILE,
      releasesRenamed: 2,
      tracksRenamed: 2,
      skipped: 0,
    });
    expect(h.inserts).toEqual([
      {
        creatorProfileId: PROFILE,
        oldSlug: 'take-me-over-2',
        contentType: 'release',
        releaseId: 'rel-tmo',
      },
      {
        creatorProfileId: PROFILE,
        oldSlug: 'seaside-heights-3',
        contentType: 'release',
        releaseId: 'rel-seaside',
      },
    ]);
    expect(h.updates.map(u => (u as { slug: string }).slug)).toEqual([
      'take-me-over',
      'seaside-heights-2019',
      'sober',
      'take-me-over',
    ]);
    expect(h.revalidateTag).toHaveBeenCalledWith(
      'smartlink-content:profile-tim',
      'max'
    );
    expect(h.revalidateTag).toHaveBeenCalledWith('sitemap-catalog', 'max');
  });

  it('counts a row changed by someone else as skipped and does not invalidate', async () => {
    h.updateFails = true;
    const result = await migrateLegacySlugsForProfile(
      PROFILE,
      fakeConn(timCatalog())
    );
    expect(result.releasesRenamed + result.tracksRenamed).toBe(0);
    expect(result.skipped).toBe(4);
    expect(h.revalidateTag).not.toHaveBeenCalled();
  });

  it('does nothing for a catalog without legacy slugs', async () => {
    const result = await migrateLegacySlugsForProfile(
      PROFILE,
      fakeConn([
        [
          {
            id: 'r',
            title: 'Sober',
            slug: 'sober',
            releaseDate: null,
            popularity: null,
          },
        ],
        [],
        [],
        [],
        [],
        [],
        [{ id: 't', releaseId: 'r', title: 'Sober', slug: 'sober' }],
      ])
    );
    expect(result).toMatchObject({ releasesRenamed: 0, tracksRenamed: 0 });
    expect(h.updates).toEqual([]);
  });
});

describe('sweepLegacySlugsForCron', () => {
  beforeEach(() => {
    h.inserts = [];
    h.updates = [];
    h.updateFails = false;
  });

  it('migrates each due profile once and totals the renames', async () => {
    const result = await sweepLegacySlugsForCron(
      fakeConn([[{ id: PROFILE }], [{ id: PROFILE }], ...timCatalog()])
    );
    expect(result).toEqual({
      profilesChecked: 1,
      releasesRenamed: 2,
      tracksRenamed: 2,
      failed: 0,
    });
  });
});
