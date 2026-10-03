import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      );

    const result = await getReleasesForProfileLite(PROFILE_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.primaryPreviewUrl).toBe(
      'https://cdn.example/preview-1.mp3'
    );
    expect(result[1]?.primaryPreviewUrl).toBeNull();
    // One release read plus the two related-record reads.
    expect(hoisted.selectMock).toHaveBeenCalledTimes(3);
  });
});
