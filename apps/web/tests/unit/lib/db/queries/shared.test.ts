import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  getAuthenticatedProfile,
  getUserByIdentity,
  verifyProfileOwnership,
} from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';

function createQueryChain<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const leftJoin = vi.fn(() => ({ where }));
  const innerJoin = vi.fn(() => ({ leftJoin }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));

  return {
    tx: { select } as unknown as Parameters<typeof getAuthenticatedProfile>[0],
    mocks: {
      innerJoin,
      leftJoin,
      limit,
      select,
      where,
    },
  };
}

describe('shared ownership queries', () => {
  it('resolves Better Auth app ids after the legacy Clerk lookup misses', async () => {
    const firstLimit = vi.fn().mockResolvedValue([]);
    const secondLimit = vi.fn().mockResolvedValue([
      {
        id: 'user_123',
        clerkId: 'user_legacy',
        email: 'user@example.com',
        isAdmin: false,
        isPro: true,
        userStatus: 'active',
        deletedAt: null,
      },
    ]);
    const firstWhere = vi.fn(() => ({ limit: firstLimit }));
    const secondWhere = vi.fn(() => ({ limit: secondLimit }));
    const firstFrom = vi.fn(() => ({ where: firstWhere }));
    const secondFrom = vi.fn(() => ({ where: secondWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: firstFrom })
      .mockReturnValueOnce({ from: secondFrom });

    const result = await getUserByIdentity(
      { select } as unknown as Parameters<typeof getUserByIdentity>[0],
      'user_123'
    );

    const dialect = new PgDialect();
    expect(result?.id).toBe('user_123');
    expect(select).toHaveBeenCalledTimes(2);
    expect(dialect.sqlToQuery(firstWhere.mock.calls[0][0]).sql).toContain(
      '"users"."clerk_id" ='
    );
    expect(dialect.sqlToQuery(secondWhere.mock.calls[0][0]).sql).toContain(
      '"users"."id" ='
    );
  });

  it('checks canonical and legacy ownership in getAuthenticatedProfile', async () => {
    const { mocks, tx } = createQueryChain([
      {
        id: 'profile_123',
        usernameNormalized: 'timwhite',
        userId: 'user_123',
        avatarUrl: null,
        avatarLockedByUser: false,
        displayNameLocked: false,
      },
    ]);

    const result = await getAuthenticatedProfile(tx, 'profile_123', 'user_abc');

    const dialect = new PgDialect();
    const selectArgs = mocks.select.mock.calls[0][0];
    const innerJoinSql = dialect.sqlToQuery(
      mocks.innerJoin.mock.calls[0][1]
    ).sql;
    const leftJoinSql = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]).sql;
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;

    expect(result?.id).toBe('profile_123');
    expect(selectArgs.userId).toBe(users.id);
    expect(innerJoinSql).toContain('"users"."id" =');
    expect(innerJoinSql).not.toContain('"users"."clerk_id"');
    expect(leftJoinSql).toContain('"user_profile_claims"."creator_profile_id"');
    expect(leftJoinSql).toContain('"user_profile_claims"."user_id"');
    expect(whereSql).toContain('"user_profile_claims"."id" is not null');
    expect(whereSql).toContain('"creator_profiles"."user_id" = "users"."id"');
    expect(whereSql).not.toContain('active_profile_id');
  });

  it('checks canonical and legacy ownership in verifyProfileOwnership', async () => {
    const { mocks, tx } = createQueryChain([{ id: 'profile_123' }]);

    const result = await verifyProfileOwnership(tx, 'profile_123', 'user_abc');

    const dialect = new PgDialect();
    const innerJoinSql = dialect.sqlToQuery(
      mocks.innerJoin.mock.calls[0][1]
    ).sql;
    const leftJoinSql = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]).sql;
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;

    expect(result?.id).toBe('profile_123');
    expect(innerJoinSql).toContain('"users"."id" =');
    expect(innerJoinSql).not.toContain('"users"."clerk_id"');
    expect(leftJoinSql).toContain('"user_profile_claims"."creator_profile_id"');
    expect(whereSql).toContain('"user_profile_claims"."id" is not null');
    expect(whereSql).toContain('"creator_profiles"."user_id" = "users"."id"');
    expect(whereSql).not.toContain('active_profile_id');
  });
});
