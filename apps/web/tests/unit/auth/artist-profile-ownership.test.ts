import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getProfileByClerkId,
  updateProfileRecords,
} from '@/app/api/dashboard/profile/lib/db-operations';
import {
  updateAllowProfilePhotoDownloads,
  updateCreatorProfile,
  updateShowOldReleases,
} from '@/app/app/(shell)/dashboard/actions/creator-profile';
import { getDashboardShellData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { switchActiveProfile } from '@/app/app/(shell)/dashboard/actions/switch-profile';
import { db } from '@/lib/db';
import { getInternalDb, setInternalDb } from '@/lib/db/client/connection';
import type { DbType } from '@/lib/db/client/types';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { tourDates } from '@/lib/db/schema/tour';

const mocks = vi.hoisted(() => ({
  actor: '',
  getCachedAuth: vi.fn(),
  withDbSession: vi.fn(),
  withDbSessionTx: vi.fn(),
  invalidateProfileCache: vi.fn(),
  invalidateUsernameChange: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/session', () => ({
  withDbSession: mocks.withDbSession,
  withDbSessionTx: mocks.withDbSessionTx,
  setupDbSession: vi.fn(),
}));
vi.mock('@/lib/auth/gate', () => ({ resolveUserState: vi.fn() }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: vi.fn(),
}));
vi.mock('@/lib/acquisition/activation-receipt', () => ({
  attachFirstTouchReceipt: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: mocks.invalidateProfileCache,
  invalidateUsernameChange: mocks.invalidateUsernameChange,
}));
vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}));

// Opt-in disposable loopback DB only. Never fall back to DATABASE_URL.
const url = process.env.PROFILE_OWNERSHIP_TEST_DATABASE_URL;
const accountA = randomUUID();
const accountB = randomUUID();
const legacy = randomUUID();
const transferred = randomUUID();
const selected = randomUUID();
const managed = randomUUID();
const viewer = randomUUID();
const ambiguous = randomUUID();
const tables = [
  users,
  creatorProfiles,
  userProfileClaims,
  suggestedActions,
  tourDates,
];

describe('artist profile ownership on PostgreSQL fixtures', () => {
  let execute: (query: string) => Promise<unknown>;
  let close: () => Promise<void>;
  let previousDb: DbType | undefined;
  let installed = false;

  beforeAll(async () => {
    previousDb = getInternalDb();
    let fixtureDb: DbType;
    if (url) {
      const target = new URL(url);
      if (
        target.hostname !== '127.0.0.1' ||
        target.pathname !== '/jov8369_profile_contract'
      ) {
        throw new Error(
          'Requires disposable loopback jov8369_profile_contract database'
        );
      }
      const client = postgres(target.toString(), { max: 1 });
      execute = query => client.unsafe(query);
      close = () => client.end();
      fixtureDb = drizzle(client) as unknown as DbType;
    } else {
      // Installed embedded PostgreSQL runs this same behavioral contract in
      // the fast CI lane, with no network/database credentials or skips.
      const client = new PGlite();
      execute = query => client.exec(query);
      close = () => client.close();
      fixtureDb = drizzlePglite(client) as unknown as DbType;
    }
    // Production Drizzle queries/transactions against isolated fixture tables.
    // This does not certify deployed RLS, indexes, or browser rendering.
    for (const table of tables) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => {
        const type =
          column.getSQLType() === 'uuid'
            ? 'uuid'
            : ({
                boolean: 'boolean',
                number: 'integer',
                date: 'timestamp',
                json: 'jsonb',
                array: 'text[]',
              }[column.dataType] ?? 'text');
        return `"${column.name}" ${type}${column.name === 'id' ? ' PRIMARY KEY DEFAULT gen_random_uuid()' : ''}`;
      });
      await execute(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    // Install the existing session identity helper, then execute the actual
    // append-only migration rather than a test copy of its authorization SQL.
    const identityMigration = await readFile(
      new URL(
        '../../../drizzle/migrations/0086_sensitive_tables_rls.sql',
        import.meta.url
      ),
      'utf8'
    );
    await execute(identityMigration.split('--> statement-breakpoint')[0]);
    await execute(
      await readFile(
        new URL(
          '../../../drizzle/migrations/0148_canonical_profile_write_access.sql',
          import.meta.url
        ),
        'utf8'
      )
    );
    await execute(`CREATE ROLE profile_fixture_actor NOLOGIN;
      GRANT USAGE ON SCHEMA public TO profile_fixture_actor;
      GRANT SELECT, UPDATE ON users, creator_profiles TO profile_fixture_actor;
      GRANT SELECT ON user_profile_claims TO profile_fixture_actor;
      ALTER TABLE user_profile_claims ENABLE ROW LEVEL SECURITY;
      ALTER TABLE user_profile_claims FORCE ROW LEVEL SECURITY;
      CREATE POLICY user_profile_claims_select_owner ON user_profile_claims
        FOR SELECT USING (user_id = current_app_user_uuid())`);
    // Replay the shipped profile SELECT/UPDATE policies under a non-bypass
    // role too; ordinary fixture setup runs as the disposable DB owner.
    await execute(
      'ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE creator_profiles FORCE ROW LEVEL SECURITY'
    );
    for (const statement of identityMigration.split(
      '--> statement-breakpoint'
    )) {
      if (
        /CREATE POLICY "creator_profiles_(select_public|select_owner|update_owner)"/.test(
          statement
        )
      )
        await execute(statement);
    }
    setInternalDb(fixtureDb);
    installed = true;
    mocks.withDbSession.mockImplementation(callback => callback(mocks.actor));
    mocks.withDbSessionTx.mockImplementation(callback =>
      runAtomicDbOperation(tx => callback(tx, mocks.actor), {
        actorId: mocks.actor,
        retry: 'never',
      })
    );
    mocks.getCachedAuth.mockImplementation(async () => ({
      userId: mocks.actor,
    }));
  }, 30_000);

  afterAll(async () => {
    if (installed) setInternalDb(previousDb);
    if (installed && url) {
      await execute('RESET ROLE');
      for (const table of [...tables].reverse())
        await execute(`DROP TABLE "${getTableConfig(table).name}" CASCADE`);
      await execute(
        'DROP FUNCTION current_app_user_can_write_profile(uuid); DROP FUNCTION current_app_user_uuid(); DROP OWNED BY profile_fixture_actor; DROP ROLE profile_fixture_actor'
      );
    }
    await close?.();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await execute('RESET ROLE');
    mocks.actor = accountA;
    for (const table of tables)
      await execute(`TRUNCATE "${getTableConfig(table).name}"`);
    await db.insert(users).values([
      {
        id: accountA,
        name: 'Casey Account',
        email: 'casey@example.com',
        activeProfileId: legacy,
      },
      { id: accountB, name: 'Morgan Account', email: 'morgan@example.com' },
    ]);
    const now = new Date();
    await db.insert(creatorProfiles).values(
      [
        { id: legacy, userId: accountA },
        { id: transferred, userId: accountA },
        { id: selected, userId: accountB },
        { id: managed, userId: accountB },
        { id: viewer, userId: accountA },
        { id: ambiguous, userId: accountA },
      ].map((row, index) => ({
        ...row,
        creatorType: 'artist' as const,
        username: `artist-${index}`,
        usernameNormalized: `artist-${index}`,
        displayName: `Artist ${index}`,
        bio: 'Original bio',
        isPublic: true,
        isClaimed: true,
        settings: { preserved: true },
        profileEditVersion: 1,
        onboardingCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      }))
    );
    await db.insert(userProfileClaims).values([
      { userId: accountB, creatorProfileId: transferred, role: 'owner' },
      { userId: accountA, creatorProfileId: selected, role: 'owner' },
      { userId: accountB, creatorProfileId: managed, role: 'owner' },
      { userId: accountA, creatorProfileId: managed, role: 'manager' },
      { userId: accountA, creatorProfileId: viewer, role: 'viewer' },
      { userId: accountA, creatorProfileId: ambiguous, role: 'owner' },
      { userId: accountA, creatorProfileId: ambiguous, role: 'manager' },
    ]);
  });

  async function selectProfile(id: string) {
    await db
      .update(users)
      .set({ activeProfileId: id })
      .where(eq(users.id, accountA));
  }
  async function profile(id: string) {
    const [row] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, id));
    return row;
  }
  async function accountNames() {
    return (await db.select({ name: users.name }).from(users))
      .map(row => row.name)
      .sort();
  }

  it.each([transferred, viewer, ambiguous])(
    'rejects stale legacy or non-writable claims for %s',
    async id => {
      await expect(
        updateCreatorProfile(id, { bio: 'Unauthorized edit' })
      ).rejects.toThrow('Profile not found or unauthorized');
      expect((await profile(id)).bio).toBe('Original bio');
      expect(mocks.invalidateProfileCache).not.toHaveBeenCalled();
    }
  );

  it.each([selected, managed, legacy])(
    'persists only the exact authorized entity %s',
    async id => {
      const names = await accountNames();
      const result = await updateCreatorProfile(id, {
        displayName: 'Updated Artist',
        bio: 'Updated bio',
      });
      expect(result.id).toBe(id);
      expect(await profile(id)).toMatchObject({
        displayName: 'Updated Artist',
        bio: 'Updated bio',
        profileEditVersion: 2,
      });
      const otherId = id === legacy ? selected : legacy;
      expect((await profile(otherId)).displayName).not.toBe('Updated Artist');
      expect(await accountNames()).toEqual(names);
      expect(mocks.invalidateProfileCache).toHaveBeenCalledWith(
        result.usernameNormalized,
        result.usernameNormalized
      );
    }
  );

  it('rejects a revoked active selection even when switching to the same id', async () => {
    await selectProfile(transferred);
    expect((await switchActiveProfile(transferred)).success).toBe(false);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('does not backfill a stale legacy owner or change their active profile', async () => {
    expect((await switchActiveProfile(transferred)).success).toBe(false);
    const [account] = await db
      .select()
      .from(users)
      .where(eq(users.id, accountA));
    expect(account.activeProfileId).toBe(legacy);
    const claims = await db
      .select()
      .from(userProfileClaims)
      .where(eq(userProfileClaims.creatorProfileId, transferred));
    expect(claims.map(claim => claim.userId)).toEqual([accountB]);
  });

  it.each([selected, managed, legacy])(
    'switches only to an authorized profile %s',
    async id => {
      expect(await switchActiveProfile(id)).toEqual({ success: true });
      const [account] = await db
        .select()
        .from(users)
        .where(eq(users.id, accountA));
      expect(account.activeProfileId).toBe(id);
    }
  );

  it('writes profile settings to the selected claim instead of the first legacy profile', async () => {
    await selectProfile(selected);
    await updateAllowProfilePhotoDownloads(true);
    expect((await profile(selected)).settings).toMatchObject({
      preserved: true,
      allowProfilePhotoDownloads: true,
    });
    expect((await profile(legacy)).settings).toEqual({ preserved: true });
  });

  it('keeps artist display-name edits separate from both account identities', async () => {
    const names = await accountNames();
    // Retain the old incidental account-name field as hostile runtime input.
    const input = {
      appUserId: accountA,
      profileId: managed,
      dbProfileUpdates: { displayName: 'Stage Name' },
      displayNameForUserUpdate: 'Must not rename an account',
      usernameUpdate: undefined,
      precomputedAvatarTheme: undefined,
    };
    const result = await runAtomicDbOperation(
      tx =>
        updateProfileRecords({
          ...input,
          tx,
        }),
      { actorId: accountA, retry: 'never' }
    );
    expect(result).not.toBeInstanceOf(Response);
    expect((await profile(managed)).displayName).toBe('Stage Name');
    expect(await accountNames()).toEqual(names);
  });

  it('reloads the same selected entity in the profile API and owner shell', async () => {
    await selectProfile(selected);
    await updateCreatorProfile(selected, {
      displayName: 'Stage Name',
      bio: 'Published bio',
    });
    expect(
      (
        await runAtomicDbOperation(tx => getProfileByClerkId(accountA, tx), {
          actorId: accountA,
          retry: 'never',
        })
      )?.profile
    ).toMatchObject({
      id: selected,
      displayName: 'Stage Name',
      bio: 'Published bio',
    });
    const owner = await getDashboardShellData(accountA);
    expect(owner.dashboardLoadError).toBeUndefined();
    expect(owner.selectedProfile).toMatchObject({
      id: selected,
      displayName: 'Stage Name',
      bio: 'Published bio',
    });
    expect(owner.creatorProfiles.map(row => row.id).sort()).toEqual(
      [legacy, selected, managed].sort()
    );
    // Public profile data is read from this same immutable creator row.
    expect(await profile(selected)).toMatchObject({
      displayName: 'Stage Name',
      bio: 'Published bio',
      isPublic: true,
    });
  });

  it('does not allow runtime input to rewrite ownership or the entity id', async () => {
    await updateCreatorProfile(legacy, {
      bio: 'Safe edit',
      userId: accountB,
      id: selected,
    } as Parameters<typeof updateCreatorProfile>[1]);
    expect(await profile(legacy)).toMatchObject({
      userId: accountA,
      bio: 'Safe edit',
    });
    expect((await profile(selected)).bio).toBe('Original bio');
  });

  it('returns an empty owner state without editing another account profile', async () => {
    const emptyAccount = randomUUID();
    await db.insert(users).values({ id: emptyAccount, name: 'Empty Account' });
    mocks.actor = emptyAccount;
    expect(
      await runAtomicDbOperation(tx => getProfileByClerkId(emptyAccount, tx), {
        actorId: emptyAccount,
        retry: 'never',
      })
    ).toBeNull();
    await expect(updateShowOldReleases(true)).rejects.toThrow(
      'Profile not found'
    );
    const owner = await getDashboardShellData(emptyAccount);
    expect(owner.selectedProfile).toBeNull();
    expect(owner.needsOnboarding).toBe(true);
    expect((await profile(legacy)).settings).toEqual({ preserved: true });
    expect(mocks.invalidateProfileCache).not.toHaveBeenCalled();
  });

  it('does not resolve a profile for an absent account', async () => {
    const absentAccount = randomUUID();
    expect(
      await runAtomicDbOperation(tx => getProfileByClerkId(absentAccount, tx), {
        actorId: absentAccount,
        retry: 'never',
      })
    ).toBeNull();
  });

  it('invalidates both public handles only after a successful exact rename', async () => {
    await updateCreatorProfile(legacy, {
      username: 'new-stage-name',
      usernameNormalized: 'new-stage-name',
    });
    expect((await profile(legacy)).usernameNormalized).toBe('new-stage-name');
    expect(mocks.invalidateProfileCache).toHaveBeenCalledWith(
      'new-stage-name',
      'artist-0'
    );
  });

  it('rejects a stale owner even when RLS hides the canonical claim', async () => {
    await execute('SET ROLE profile_fixture_actor');
    try {
      const visible = await runAtomicDbOperation(
        tx =>
          tx
            .select()
            .from(userProfileClaims)
            .where(eq(userProfileClaims.creatorProfileId, transferred)),
        { actorId: accountA, retry: 'never' }
      );
      expect(visible).toEqual([]);
      await expect(
        execute(
          await readFile(
            new URL(
              '../../../drizzle/migrations/0148_canonical_profile_write_access.sql',
              import.meta.url
            ),
            'utf8'
          )
        )
      ).rejects.toThrow('requires a bypass-capable migration owner');
      const denied = await runAtomicDbOperation(
        tx =>
          updateProfileRecords({
            tx,
            appUserId: accountA,
            profileId: transferred,
            dbProfileUpdates: { bio: 'Hidden-claim API attack' },
            usernameUpdate: undefined,
            precomputedAvatarTheme: undefined,
          }),
        { actorId: accountA, retry: 'never' }
      );
      expect(denied).toBeInstanceOf(Response);
      expect((denied as Response).status).toBe(404);
      await expect(
        updateCreatorProfile(transferred, { bio: 'Hidden-claim attack' })
      ).rejects.toThrow('Profile not found or unauthorized');
      expect((await switchActiveProfile(transferred)).success).toBe(false);
      mocks.actor = accountB;
      await updateCreatorProfile(transferred, { bio: 'Canonical owner edit' });
      expect((await profile(transferred)).bio).toBe('Canonical owner edit');
    } finally {
      await execute('RESET ROLE');
    }
  });

  it('rolls back a rejected database write before invalidating public caches', async () => {
    await execute(
      `CREATE FUNCTION pg_temp.reject_profile_edit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected profile failure'; END $$`
    );
    await execute(
      `CREATE TRIGGER reject_profile_edit BEFORE UPDATE ON creator_profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_profile_edit()`
    );
    try {
      await expect(
        updateCreatorProfile(legacy, { bio: 'Must roll back' })
      ).rejects.toThrow();
      expect((await profile(legacy)).bio).toBe('Original bio');
      expect(mocks.invalidateProfileCache).not.toHaveBeenCalled();
    } finally {
      await execute('DROP TRIGGER reject_profile_edit ON creator_profiles');
    }
  });
});
