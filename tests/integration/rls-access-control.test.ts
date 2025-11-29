import { sql as drizzleSql, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { creatorProfiles, users } from '@/lib/db/schema';

// Use the global test database connection provisioned in tests/setup.ts
const db = (globalThis as typeof globalThis & { db?: any }).db;

if (!db) {
  describe.skip('RLS access control (database)', () => {
    it('skips because no database connection is configured', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('RLS access control (database)', () => {
    let userAClerkId: string;
    let userBClerkId: string;
    let publicProfileId: string;
    let privateProfileId: string;

    beforeAll(async () => {
      const now = Date.now();
      userAClerkId = `rls_user_a_${now}`;
      userBClerkId = `rls_user_b_${now}`;

      const [userA, userB] = await db
        .insert(users)
        .values([{ clerkId: userAClerkId }, { clerkId: userBClerkId }])
        .returning({ id: users.id });

      const [publicProfile, privateProfile] = await db
        .insert(creatorProfiles)
        .values([
          {
            userId: userA.id,
            creatorType: 'artist',
            username: `rls-public-${now}`,
            usernameNormalized: `rls-public-${now}`,
            isPublic: true,
          },
          {
            userId: userB.id,
            creatorType: 'artist',
            username: `rls-private-${now}`,
            usernameNormalized: `rls-private-${now}`,
            isPublic: false,
          },
        ])
        .returning({ id: creatorProfiles.id });

      publicProfileId = publicProfile.id;
      privateProfileId = privateProfile.id;
    });

    it("prevents a user from reading another user's private profile", async () => {
      const rows = await db.transaction(async (tx: any) => {
        await tx.execute(drizzleSql`SET LOCAL app.user_id = ${userAClerkId}`);
        return tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, privateProfileId));
      });

      expect(rows.length).toBe(0);
    });

    it('allows the owner to read their own private profile', async () => {
      const rows = await db.transaction(async (tx: any) => {
        await tx.execute(drizzleSql`SET LOCAL app.user_id = ${userBClerkId}`);
        return tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, privateProfileId));
      });

      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe(privateProfileId);
    });

    it("prevents a user from updating another user's profile", async () => {
      const updated = await db.transaction(async (tx: any) => {
        await tx.execute(drizzleSql`SET LOCAL app.user_id = ${userAClerkId}`);
        return tx
          .update(creatorProfiles)
          .set({ displayName: 'unauthorized-update' })
          .where(eq(creatorProfiles.id, privateProfileId))
          .returning({ id: creatorProfiles.id });
      });

      expect(updated.length).toBe(0);
    });

    it('allows anonymous reads of public profiles only', async () => {
      const [publicRows, privateRows] = await db.transaction(
        async (tx: any) => {
          const pub = await tx
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.id, publicProfileId));

          const priv = await tx
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.id, privateProfileId));

          return [pub, priv] as const;
        }
      );

      expect(publicRows.length).toBe(1);
      expect(publicRows[0]?.id).toBe(publicProfileId);
      expect(privateRows.length).toBe(0);
    });
  });
}
