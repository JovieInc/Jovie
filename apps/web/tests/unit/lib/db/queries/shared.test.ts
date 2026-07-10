import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  getAuthenticatedProfile,
  getUserByIdentity,
  verifyProfileOwnership,
} from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';

const APP_UUID = '912cfbb0-a2f6-494d-a880-da3e581c4b3a';

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

function createUserQueryChain<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    tx: { select } as unknown as Parameters<typeof getUserByIdentity>[0],
    mocks: { from, limit, select, where },
  };
}

describe('shared ownership queries', () => {
  it('resolves every live identity shape in a single dual-read query', async () => {
    // One query matches clerk_id OR better_auth_user_id (OR users.id when the
    // input is UUID-shaped) — the two-step fallback threw a Postgres uuid
    // cast error whenever a non-UUID identity missed the clerk_id match.
    const { mocks, tx } = createUserQueryChain([
      {
        id: APP_UUID,
        clerkId: 'ba:3PrEc2kJI1rknuVLVD5VstQ7IxsjyIkP',
        email: 'user@example.com',
        isAdmin: false,
        isPro: true,
        userStatus: 'active',
        deletedAt: null,
      },
    ]);

    const result = await getUserByIdentity(tx, APP_UUID);

    const dialect = new PgDialect();
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;
    expect(result?.id).toBe(APP_UUID);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(whereSql).toContain('"users"."clerk_id" =');
    expect(whereSql).toContain('"users"."better_auth_user_id" =');
    expect(whereSql).toContain('"users"."id" =');
  });

  it('omits the uuid clause for non-UUID identities (postgres cast safety)', async () => {
    const { mocks, tx } = createUserQueryChain([]);

    const result = await getUserByIdentity(tx, 'user_legacy_clerk');

    const dialect = new PgDialect();
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;
    expect(result).toBeNull();
    expect(whereSql).toContain('"users"."clerk_id" =');
    expect(whereSql).toContain('"users"."better_auth_user_id" =');
    expect(whereSql).not.toContain('"users"."id" =');
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

    const result = await getAuthenticatedProfile(tx, 'profile_123', APP_UUID);

    const dialect = new PgDialect();
    const selectArgs = mocks.select.mock.calls[0][0];
    const innerJoinSql = dialect.sqlToQuery(
      mocks.innerJoin.mock.calls[0][1]
    ).sql;
    const leftJoinSql = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]).sql;
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;

    expect(result?.id).toBe('profile_123');
    expect(selectArgs.userId).toBe(users.id);
    // Dual-read identity join: app UUID matches users.id, and migration-era
    // clerk_id / better_auth_user_id shapes still resolve.
    expect(innerJoinSql).toContain('"users"."id" =');
    expect(innerJoinSql).toContain('"users"."clerk_id" =');
    expect(innerJoinSql).toContain('"users"."better_auth_user_id" =');
    expect(leftJoinSql).toContain('"user_profile_claims"."creator_profile_id"');
    expect(leftJoinSql).toContain('"user_profile_claims"."user_id"');
    expect(whereSql).toContain('"user_profile_claims"."id" is not null');
    expect(whereSql).toContain('"creator_profiles"."user_id" = "users"."id"');
    expect(whereSql).not.toContain('active_profile_id');
  });

  it('checks canonical and legacy ownership in verifyProfileOwnership', async () => {
    const { mocks, tx } = createQueryChain([{ id: 'profile_123' }]);

    const result = await verifyProfileOwnership(tx, 'profile_123', APP_UUID);

    const dialect = new PgDialect();
    const innerJoinSql = dialect.sqlToQuery(
      mocks.innerJoin.mock.calls[0][1]
    ).sql;
    const leftJoinSql = dialect.sqlToQuery(mocks.leftJoin.mock.calls[0][1]).sql;
    const whereSql = dialect.sqlToQuery(mocks.where.mock.calls[0][0]).sql;

    expect(result?.id).toBe('profile_123');
    expect(innerJoinSql).toContain('"users"."id" =');
    expect(innerJoinSql).toContain('"users"."clerk_id" =');
    expect(leftJoinSql).toContain('"user_profile_claims"."creator_profile_id"');
    expect(whereSql).toContain('"user_profile_claims"."id" is not null');
    expect(whereSql).toContain('"creator_profiles"."user_id" = "users"."id"');
    expect(whereSql).not.toContain('active_profile_id');
  });
});
