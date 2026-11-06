import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODCERT_CLAIM_CANARY_EMAIL } from './prodcert-identities';

const hoisted = vi.hoisted(() => ({
  accountRow: [] as unknown[],
  /** Await results per tx select, keyed by the SQL table name. */
  txSelectQueue: new Map<string, unknown[]>(),
  inserted: [] as { table: string; row: Record<string, unknown> }[],
  deleted: [] as { table: string }[],
  profileUpdates: [] as { table: string; set: unknown }[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => hoisted.accountRow,
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/legacy-transaction', async () => {
  const { getTableName } = await import('drizzle-orm');
  return {
    runAtomicDbOperation: async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => ({
          from: (t: unknown) => ({
            where: async () => {
              const queue = hoisted.txSelectQueue;
              const results = queue.get(getTableName(t as never)) ?? [];
              return results.shift() ?? [];
            },
          }),
        }),
        delete: (table: unknown) => ({
          where: async () => {
            hoisted.deleted.push({ table: getTableName(table as never) });
          },
        }),
        update: (table: unknown) => ({
          set: (set: unknown) => ({
            where: async () => {
              hoisted.profileUpdates.push({
                table: getTableName(table as never),
                set,
              });
              return [{ id: 'profile-1' }];
            },
          }),
        }),
        insert: (table: unknown) => ({
          values: (row: Record<string, unknown>) => {
            hoisted.inserted.push({
              table: getTableName(table as never),
              row,
            });
            return Promise.resolve();
          },
        }),
      };
      return fn(tx);
    },
  };
});
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), enabled: false },
}));

import { executeCanaryReset } from './canary-reset.server';

const CANARY_USER_ID = 'c1111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';

// The drizzle table objects stringify via their Symbol.target name; queue
// keys below use the SQL table names the executor selects from.
const CLAIMS_TABLE = 'user_profile_claims';
const PROFILES_TABLE = 'creator_profiles';

describe('executeCanaryReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.accountRow = [];
    hoisted.txSelectQueue = new Map();
    hoisted.inserted = [];
    hoisted.deleted = [];
    hoisted.profileUpdates = [];
  });

  it('refuses with unknown_canary_account when the canary user row is absent', async () => {
    await expect(executeCanaryReset()).resolves.toEqual({
      ok: false,
      reason: 'unknown_canary_account',
    });
  });

  it('refuses when the resolved account email is not the exact canary', async () => {
    hoisted.accountRow = [
      { id: CANARY_USER_ID, email: 'browse-ready+clerk_test@jov.ie' },
    ];
    await expect(executeCanaryReset()).resolves.toEqual({
      ok: false,
      reason: 'unknown_canary_account',
    });
    expect(hoisted.profileUpdates).toEqual([]);
    expect(hoisted.deleted).toEqual([]);
  });

  it('soft-unclaims, clears onboarding, purges walk rows and audits in one pass', async () => {
    hoisted.accountRow = [
      { id: CANARY_USER_ID, email: PRODCERT_CLAIM_CANARY_EMAIL },
    ];
    hoisted.txSelectQueue.set(CLAIMS_TABLE, [
      { id: 'claim-1', userId: CANARY_USER_ID },
    ]);
    hoisted.txSelectQueue.set(PROFILES_TABLE, [
      {
        id: 'profile-1',
        userId: CANARY_USER_ID,
        usernameNormalized: 'jovie-prodcert-claim',
        isClaimed: true,
        isPublic: true,
        claimedAt: new Date(),
        claimToken: 'tok',
        claimTokenExpiresAt: new Date(),
        onboardingCompletedAt: new Date(),
        settings: null,
      },
      {
        // A foreign-owned claimed profile must never be touched.
        id: 'profile-other',
        userId: OTHER_USER_ID,
        usernameNormalized: 'someone-else',
        isClaimed: true,
        isPublic: true,
        claimedAt: new Date(),
        claimToken: null,
        claimTokenExpiresAt: null,
        onboardingCompletedAt: new Date(),
        settings: null,
      },
    ]);

    const outcome = await executeCanaryReset();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.summary).toContain('claims=1');
    expect(outcome.summary).toContain('profiles=1');
    expect(outcome.summary).toContain('handles=jovie-prodcert-claim');
    expect(outcome.summary).not.toContain(PRODCERT_CLAIM_CANARY_EMAIL);

    // Exactly one profile write, scoped to the canary user id, pre-claim set.
    expect(hoisted.profileUpdates).toHaveLength(1);
    expect(hoisted.profileUpdates[0]?.table).toBe(PROFILES_TABLE);
    const set = hoisted.profileUpdates[0]?.set as Record<string, unknown>;
    expect(set.userId).toBeNull();
    expect(set.isClaimed).toBe(false);
    expect(set.isPublic).toBe(false);
    expect(set.onboardingCompletedAt).toBeNull();

    // Ownership audit row written for the unclaimed profile, tagged internal.
    expect(hoisted.inserted).toHaveLength(1);
    expect(hoisted.inserted[0]?.table).toBe('profile_ownership_log');
    expect(String(hoisted.inserted[0]?.row?.reason)).toContain('JOV-9826');

    // Walk-owned rows purged: chat conversations + suggested actions.
    const deletedTables = hoisted.deleted.map(d => d.table).sort();
    expect(deletedTables).toEqual(['chat_conversations', 'suggested_actions']);
  });
});
