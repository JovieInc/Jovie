import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  getAuthenticatedProfile,
  verifyProfileOwnership,
} from '@/lib/db/queries/shared';

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
    const innerJoinSql = dialect.sqlToQuery(
      mocks.innerJoin.mock.calls[0][1]
    ).sql;
    const leftJoinSql = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]).sql;
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;

    expect(result?.id).toBe('profile_123');
    expect(innerJoinSql).toContain('"users"."clerk_id" =');
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
    expect(innerJoinSql).toContain('"users"."clerk_id" =');
    expect(leftJoinSql).toContain('"user_profile_claims"."creator_profile_id"');
    expect(whereSql).toContain('"user_profile_claims"."id" is not null');
    expect(whereSql).toContain('"creator_profiles"."user_id" = "users"."id"');
    expect(whereSql).not.toContain('active_profile_id');
  });
});
