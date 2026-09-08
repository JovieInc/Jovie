import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE as FIXTURE } from './opaque-internal-profile-handle';

const hoisted = vi.hoisted(() => ({
  result: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
  },
}));

function makeQuery() {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockImplementation(async () => hoisted.result),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
}

const {
  findCanonicalHandleForOpaqueProfile,
  resolveOpaqueInternalProfileUsername,
} = await import('./opaque-internal-profile-handle.server');

describe('opaque internal profile server lookup (JOV-6201)', () => {
  beforeEach(() => {
    hoisted.result = [];
    hoisted.select.mockReset().mockReturnValue(makeQuery());
  });

  it('does not query for a canonical human handle', async () => {
    await expect(
      findCanonicalHandleForOpaqueProfile(FIXTURE.ownerHandle)
    ).resolves.toBeNull();
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it('redirects the dogfood opaque ID to the claimed twin handle', async () => {
    const opaqueQuery = makeQuery();
    opaqueQuery.limit.mockResolvedValueOnce([
      { id: 'opaque-profile', spotifyId: 'spotify-tim' },
    ]);
    const twinQuery = makeQuery();
    twinQuery.limit.mockResolvedValueOnce([
      { username: FIXTURE.ownerHandle, isClaimed: true },
    ]);
    hoisted.select
      .mockReset()
      .mockReturnValueOnce(opaqueQuery)
      .mockReturnValueOnce(twinQuery);

    await expect(
      resolveOpaqueInternalProfileUsername(FIXTURE.opaqueHandle)
    ).resolves.toEqual({
      action: 'redirect',
      handle: FIXTURE.ownerHandle,
    });
  });

  it('404s an opaque ID with no public human twin', async () => {
    const opaqueQuery = makeQuery();
    opaqueQuery.limit.mockResolvedValueOnce([
      { id: 'opaque-profile', spotifyId: 'spotify-orphan' },
    ]);
    const twinQuery = makeQuery();
    twinQuery.limit.mockResolvedValueOnce([]);
    hoisted.select
      .mockReset()
      .mockReturnValueOnce(opaqueQuery)
      .mockReturnValueOnce(twinQuery);

    await expect(
      resolveOpaqueInternalProfileUsername(FIXTURE.opaqueHandle)
    ).resolves.toEqual({ action: 'not_found' });
  });
});
