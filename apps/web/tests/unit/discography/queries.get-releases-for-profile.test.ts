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

import { getReleasesForProfile } from '@/lib/discography/queries';

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
});
