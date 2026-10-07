import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN } from '@/lib/utils/email';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  doesTableExist: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  doesTableExist: mocks.doesTableExist,
  TABLE_NAMES: {
    creatorProfiles: 'creator_profiles',
    dailyProfileViews: 'daily_profile_views',
  },
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: vi.fn(),
  setupDbSession: vi.fn(),
}));
vi.mock('@/lib/db/cache', () => ({ cacheQuery: vi.fn() }));
vi.mock('@/lib/db/query-timeout', () => ({
  apiQuery: vi.fn(),
  dashboardQuery: vi.fn(),
}));

const { getCanonicalCustomerProfileExposure } = await import('./analytics');

describe('getCanonicalCustomerProfileExposure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.doesTableExist.mockResolvedValue(true);
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin });
    mocks.innerJoin.mockReturnValue({ leftJoin: mocks.leftJoin });
    mocks.leftJoin.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue([{ count: '12', latest: '2026-10-07' }]);
  });

  it.each([7, 30])(
    'binds a %i-day window as an integer and returns the measured exposure',
    async windowDays => {
      await expect(
        getCanonicalCustomerProfileExposure(windowDays)
      ).resolves.toEqual({ count: 12, latestAt: '2026-10-07' });

      const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
      expect(query.sql).toContain(
        '"daily_profile_views"."view_date" >= current_date - $1::int'
      );
      expect(query.params).toEqual([
        windowDays,
        true,
        true,
        INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
      ]);
      expect(query.sql).toContain('"creator_profiles"."is_public" = $2');
      expect(query.sql).toContain('"creator_profiles"."is_claimed" = $3');
      expect(query.sql).toContain(
        '("users"."email" is null or lower("users"."email") !~* $4)'
      );
    }
  );

  it.each(['creator_profiles', 'daily_profile_views'])(
    'returns unmeasured when %s is missing',
    async missingTable => {
      mocks.doesTableExist.mockImplementation(
        async (table: string) => table !== missingTable
      );

      await expect(getCanonicalCustomerProfileExposure(7)).resolves.toBeNull();
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it.each([{ rows: [] }, { rows: [{ count: null, latest: null }] }])(
    'returns zero exposure when there is no aggregate value ($rows)',
    async ({ rows }) => {
      mocks.where.mockResolvedValue(rows);

      await expect(getCanonicalCustomerProfileExposure(7)).resolves.toEqual({
        count: 0,
        latestAt: null,
      });
    }
  );

  it('propagates database errors instead of reporting zero exposure', async () => {
    const error = new Error('profile exposure query failed');
    mocks.where.mockRejectedValue(error);

    await expect(getCanonicalCustomerProfileExposure(7)).rejects.toBe(error);
  });
});
