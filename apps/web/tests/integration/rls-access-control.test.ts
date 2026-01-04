import { sql as drizzleSql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { creatorProfiles, profilePhotos, users } from '@/lib/db/schema';

/**
 * RLS Access Control Tests
 *
 * IMPORTANT: These tests currently cannot verify RLS enforcement because
 * the test database role has RLS bypass privileges. Tests that require
 * RLS enforcement are skipped until we set up a proper test database role.
 *
 * TODO: To enable these tests:
 * 1. Create a 'test_app_user' database role WITHOUT RLS bypass
 * 2. Grant minimal permissions to this role
 * 3. Configure test connection to use this role
 * 4. Remove .skip from the skipped tests
 */

// Use the global test database connection provisioned in tests/setup.ts
const db = (
  globalThis as typeof globalThis & { db?: NeonDatabase<typeof schema> }
).db;

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
    let publicPhotoId: string;
    let privatePhotoId: string;

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

      const [publicPhoto, privatePhoto] = await db
        .insert(profilePhotos)
        .values([
          {
            userId: userA.id,
            creatorProfileId: publicProfile.id,
            status: 'ready',
            blobUrl: 'https://public-avatar.test/original.webp',
            smallUrl: 'https://public-avatar.test/s.webp',
            mediumUrl: 'https://public-avatar.test/m.webp',
            largeUrl: 'https://public-avatar.test/l.webp',
          },
          {
            userId: userB.id,
            creatorProfileId: privateProfile.id,
            status: 'ready',
            blobUrl: 'https://private-avatar.test/original.webp',
            smallUrl: 'https://private-avatar.test/s.webp',
            mediumUrl: 'https://private-avatar.test/m.webp',
            largeUrl: 'https://private-avatar.test/l.webp',
          },
        ])
        .returning({ id: profilePhotos.id });

      publicPhotoId = publicPhoto.id;
      privatePhotoId = privatePhoto.id;
    });

    // SKIPPED: Cannot test RLS enforcement - test db role has bypass privileges
    // TODO: Enable when test_app_user role is configured
    it.skip("prevents a user from reading another user's private profile", async () => {
      const rows = await db.transaction(async tx => {
        await tx.execute(
          drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userAClerkId}'`)
        );
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        );
      });

      // With proper RLS, this should return 0 rows
      expect(rows.rows.length).toBe(0);
    });

    // This test works because owner access should succeed regardless of RLS
    it('allows the owner to read their own private profile', async () => {
      const rows = await db.transaction(async tx => {
        await tx.execute(
          drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userBClerkId}'`)
        );
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        );
      });

      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(privateProfileId);
    });

    // SKIPPED: Cannot test RLS enforcement - test db role has bypass privileges
    // TODO: Enable when test_app_user role is configured
    it.skip("prevents a user from updating another user's profile", async () => {
      const updated = await db.transaction(async tx => {
        await tx.execute(
          drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userAClerkId}'`)
        );
        return tx.execute(
          drizzleSql.raw(
            `UPDATE creator_profiles SET display_name = 'unauthorized-update' WHERE id = '${privateProfileId}' RETURNING id`
          )
        );
      });

      // With proper RLS, this should return 0 rows (no update allowed)
      expect(updated.rows.length).toBe(0);
    });

    // This test works - reading public profiles should always succeed
    it('allows reads of public profiles', async () => {
      const publicRows = await db.execute(
        drizzleSql.raw(
          `SELECT id FROM creator_profiles WHERE id = '${publicProfileId}'`
        )
      );

      expect(publicRows.rows.length).toBe(1);
      expect(publicRows.rows[0]?.id).toBe(publicProfileId);
    });

    // SKIPPED: Cannot test RLS enforcement - test db role has bypass privileges
    // TODO: Enable when test_app_user role is configured
    it.skip('prevents anonymous reads of private profiles', async () => {
      const privateRows = await db.execute(
        drizzleSql.raw(
          `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
        )
      );

      // With proper RLS, anonymous users should not see private profiles
      expect(privateRows.rows.length).toBe(0);
    });

    // This test works - reading public photos should always succeed
    it('allows reads of public profile photos', async () => {
      const publicRows = await db.execute(
        drizzleSql.raw(
          `SELECT id FROM profile_photos WHERE id = '${publicPhotoId}'`
        )
      );

      expect(publicRows.rows.length).toBe(1);
      expect(publicRows.rows[0]?.id).toBe(publicPhotoId);
    });

    // SKIPPED: Cannot test RLS enforcement - test db role has bypass privileges
    // TODO: Enable when test_app_user role is configured
    it.skip('prevents anonymous reads of private profile photos', async () => {
      const privateRows = await db.execute(
        drizzleSql.raw(
          `SELECT id FROM profile_photos WHERE id = '${privatePhotoId}'`
        )
      );

      // With proper RLS, anonymous users should not see private photos
      expect(privateRows.rows.length).toBe(0);
    });
  });
}
