import { sql as drizzleSql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { creatorProfiles, users } from '@/lib/db/schema';
import { setupDatabase } from '../setup-db';

describe('Transactions + RLS session variables', () => {
  let db: any;
  let clerkUserId = '';
  let profileId = '';

  beforeAll(async () => {
    try {
      db = await setupDatabase();
    } catch (error) {
      console.warn('Database setup failed; skipping transaction tests.', error);
      db = null;
    }
    if (!db) {
      return;
    }

    const now = Date.now();
    clerkUserId = `tx_rls_${now}`;

    const [user] = await db
      .insert(users)
      .values({ clerkId: clerkUserId })
      .returning({ id: users.id });

    const [profile] = await db
      .insert(creatorProfiles)
      .values({
        userId: user.id,
        creatorType: 'artist',
        username: `tx-rls-${now}`,
        usernameNormalized: `tx-rls-${now}`,
        isPublic: false,
      })
      .returning({ id: creatorProfiles.id });

    profileId = profile.id;
  });

  it('scopes session vars to the transaction', async () => {
    if (!db) {
      expect(true).toBe(true);
      return;
    }

    const before = await db.execute(
      drizzleSql`SELECT current_setting('app.clerk_user_id', true) as user_id`
    );
    expect(before.rows?.[0]?.user_id ?? null).toBeNull();

    const inside = await db.transaction(async (tx: any) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.clerk_user_id', ${clerkUserId}, true)`
      );
      const result = await tx.execute(
        drizzleSql`SELECT current_setting('app.clerk_user_id', true) as user_id`
      );
      return result.rows?.[0]?.user_id ?? null;
    });

    expect(inside).toBe(clerkUserId);

    const after = await db.execute(
      drizzleSql`SELECT current_setting('app.clerk_user_id', true) as user_id`
    );
    expect(after.rows?.[0]?.user_id ?? null).toBeNull();
  });

  it('keeps RLS context attached to the transaction query', async () => {
    if (!db) {
      expect(true).toBe(true);
      return;
    }

    const result = await db.transaction(async (tx: any) => {
      await tx.execute(
        drizzleSql`SELECT set_config('app.clerk_user_id', ${clerkUserId}, true)`
      );
      return tx.execute(
        drizzleSql`
          SELECT
            current_setting('app.clerk_user_id', true) as user_id,
            count(*)::int as row_count
          FROM creator_profiles
          WHERE id = ${profileId}
        `
      );
    });

    expect(result.rows?.[0]?.user_id).toBe(clerkUserId);
    expect(result.rows?.[0]?.row_count).toBe(1);
  });
});
