import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discogTracks } from '@/lib/db/schema/content';

const hoisted = vi.hoisted(() => {
  const selectMock = vi.fn();
  return { selectMock };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
  doesTableExist: vi.fn(),
}));

import {
  getReleasesForProfile,
  getReleasesForProfileLite,
} from '@/lib/discography/queries';

const PROFILE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

/**
 * Chain for the full release list: select().from().where().orderBy().limit()
 * followed by the parallel related-record reads that early-return on empty.
 */
function createReleaseListChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

/**
 * Chain for related-record reads (artist names, preview URLs):
 * select().from().innerJoin().where().{orderBy|groupBy} resolving to rows.
 */
function createRelatedReadChain(rows: unknown[]) {
  const terminal = Promise.resolve(rows);
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.from = vi.fn().mockImplementation(self);
  chain.innerJoin = vi.fn().mockImplementation(self);
  chain.where = vi.fn().mockImplementation(self);
  chain.orderBy = vi.fn().mockImplementation(() => terminal);
  chain.groupBy = vi.fn().mockImplementation(() => terminal);
  return chain;
}

describe('getReleasesForProfile deterministic bounded list (JOV-6272)', () => {
  beforeEach(() => {
    hoisted.selectMock.mockReset();
  });

  it('orders by releaseDate then id and applies an explicit limit', async () => {
    const chain = createReleaseListChain([]);
    hoisted.selectMock.mockImplementationOnce(() => chain);

    await getReleasesForProfile(PROFILE_ID, { includeDrafts: true });

    // Deterministic ordering: date first, id tiebreaker second.
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    const orderArgs = chain.orderBy.mock.calls[0] as unknown[];
    expect(orderArgs).toHaveLength(2);

    // Explicit bound on the full list (caps the server-cached matrix).
    expect(chain.limit).toHaveBeenCalledTimes(1);
    const limitArg = chain.limit.mock.calls[0]?.[0] as number;
    expect(typeof limitArg).toBe('number');
    expect(limitArg).toBeGreaterThan(0);
    expect(limitArg).toBeLessThanOrEqual(500);

    // Related-record reads never run for an empty list (graceful early return).
    expect(hoisted.selectMock).toHaveBeenCalledTimes(1);
  });

  it('orders the public projection newest-first with an id tiebreaker', async () => {
    const chain = createReleaseListChain([]);
    hoisted.selectMock.mockImplementationOnce(() => chain);

    await getReleasesForProfileLite(PROFILE_ID);

    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.orderBy.mock.calls[0]).toHaveLength(2);
    expect(chain.limit).toHaveBeenCalledWith(200);
    expect(hoisted.selectMock).toHaveBeenCalledTimes(1);
  });

  it('maps the primary preview url onto each lite release (JOV-6127)', async () => {
    const releaseRows = [
      {
        id: 'rel-1',
        title: 'Song',
        slug: 'song',
        releaseType: 'single',
        releaseDate: new Date('2026-01-01'),
        revealDate: null,
        artworkUrl: null,
      },
      {
        id: 'rel-2',
        title: 'Song Two',
        slug: 'song-two',
        releaseType: 'single',
        releaseDate: null,
        revealDate: null,
        artworkUrl: null,
      },
    ];
    hoisted.selectMock
      .mockImplementationOnce(() => createReleaseListChain(releaseRows))
      .mockImplementationOnce(() => createRelatedReadChain([]))
      .mockImplementationOnce(() =>
        createRelatedReadChain([
          {
            releaseId: 'rel-1',
            primaryPreviewUrl: 'https://cdn.example/preview-1.mp3',
          },
          { releaseId: 'rel-2', primaryPreviewUrl: null },
        ])
      )
      .mockImplementationOnce(() => createRelatedReadChain([]));

    const result = await getReleasesForProfileLite(PROFILE_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.primaryPreviewUrl).toBe(
      'https://cdn.example/preview-1.mp3'
    );
    expect(result[1]?.primaryPreviewUrl).toBeNull();
    // One release read, two related reads, and a bounded legacy fallback.
    expect(hoisted.selectMock).toHaveBeenCalledTimes(4);
  });

  it('recovers only missing previews from legacy tracks and preserves new-model previews', async () => {
    const releases = ['new', 'legacy', 'unmapped'].map(id => ({
      id,
      releaseDate: null,
      revealDate: null,
    }));
    const legacy = createRelatedReadChain([
      {
        releaseId: 'legacy',
        primaryPreviewUrl: 'https://cdn.example/legacy.mp3',
      },
      { releaseId: 'unmapped', primaryPreviewUrl: null },
    ]);
    hoisted.selectMock
      .mockImplementationOnce(() => createReleaseListChain(releases))
      .mockImplementationOnce(() => createRelatedReadChain([]))
      .mockImplementationOnce(() =>
        createRelatedReadChain([
          {
            releaseId: 'new',
            primaryPreviewUrl: 'https://cdn.example/new.mp3',
          },
          { releaseId: 'legacy', primaryPreviewUrl: null },
        ])
      )
      .mockImplementationOnce(() => legacy);

    const result = await getReleasesForProfileLite(PROFILE_ID);

    expect(result.map(row => row.primaryPreviewUrl)).toEqual([
      'https://cdn.example/new.mp3',
      'https://cdn.example/legacy.mp3',
      null,
    ]);
    expect(legacy.from).toHaveBeenCalledWith(discogTracks);
    const dialect = new PgDialect();
    const predicate = legacy.where.mock.calls[0]?.[0] as SQL;
    expect(dialect.sqlToQuery(predicate).params).toEqual([
      'legacy',
      'unmapped',
    ]);
    const selection = hoisted.selectMock.mock.calls[3]?.[0] as {
      primaryPreviewUrl: SQL.Aliased<string>;
    };
    const query = dialect.sqlToQuery(selection.primaryPreviewUrl.sql).sql;
    expect(query).toContain('BTRIM');
    expect(query).toContain('FILTER');
    expect(query).toContain('disc_number');
    expect(query).toContain('track_number');
  });

  it('skips the legacy read when every new-model preview exists', async () => {
    hoisted.selectMock
      .mockImplementationOnce(() =>
        createReleaseListChain([
          { id: 'new', releaseDate: null, revealDate: null },
        ])
      )
      .mockImplementationOnce(() => createRelatedReadChain([]))
      .mockImplementationOnce(() =>
        createRelatedReadChain([
          {
            releaseId: 'new',
            primaryPreviewUrl: 'https://cdn.example/new.mp3',
          },
        ])
      );
    expect(
      (await getReleasesForProfileLite(PROFILE_ID))[0]?.primaryPreviewUrl
    ).toBe('https://cdn.example/new.mp3');
    expect(hoisted.selectMock).toHaveBeenCalledTimes(3);
  });

  it('propagates a legacy read failure instead of caching a false empty preview', async () => {
    const legacy = createRelatedReadChain([]);
    legacy.groupBy.mockRejectedValue(new Error('legacy read unavailable'));
    hoisted.selectMock
      .mockImplementationOnce(() =>
        createReleaseListChain([
          { id: 'legacy', releaseDate: null, revealDate: null },
        ])
      )
      .mockImplementationOnce(() => createRelatedReadChain([]))
      .mockImplementationOnce(() => createRelatedReadChain([]))
      .mockImplementationOnce(() => legacy);
    await expect(getReleasesForProfileLite(PROFILE_ID)).rejects.toThrow(
      'legacy read unavailable'
    );
  });
});
