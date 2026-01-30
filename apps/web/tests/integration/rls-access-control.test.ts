import { sql as drizzleSql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { creatorProfiles, profilePhotos, users } from '@/lib/db/schema';
import { withRlsAnonymous, withRlsUser } from '../setup-db';

/**
 * RLS Access Control Tests
 *
 * These tests verify that Row Level Security (RLS) policies are properly enforced.
 * They use a test role without BYPASSRLS privilege and helper functions to simulate
 * authenticated and anonymous access patterns.
 *
 * The RLS policies enforce:
 * - Public profiles can be read by anyone
 * - Private profiles can only be read by their owners
 * - Profiles can only be updated/deleted by their owners
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
        .values([
          { clerkId: userAClerkId, userStatus: 'active' },
          { clerkId: userBClerkId, userStatus: 'active' },
        ])
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

    it("prevents a user from reading another user's private profile", async () => {
      const rows = await withRlsUser(userAClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        );
      });

      // With proper RLS, user A should not see user B's private profile
      expect(rows.rows.length).toBe(0);
    });

    it('allows the owner to read their own private profile', async () => {
      const rows = await withRlsUser(userBClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        );
      });

      // User B should be able to see their own private profile
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(privateProfileId);
    });

    it("prevents a user from updating another user's profile", async () => {
      const updated = await withRlsUser(userAClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `UPDATE creator_profiles SET display_name = 'unauthorized-update' WHERE id = '${privateProfileId}' RETURNING id`
          )
        );
      });

      // With proper RLS, user A should not be able to update user B's profile
      expect(updated.rows.length).toBe(0);
    });

    it('allows reads of public profiles', async () => {
      // Even anonymous users should be able to read public profiles
      const publicRows = await withRlsAnonymous(async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${publicProfileId}'`
          )
        );
      });

      expect(publicRows.rows.length).toBe(1);
      expect(publicRows.rows[0]?.id).toBe(publicProfileId);
    });

    it('prevents anonymous reads of private profiles', async () => {
      const privateRows = await withRlsAnonymous(async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        );
      });

      // Anonymous users should not see private profiles
      expect(privateRows.rows.length).toBe(0);
    });

    it('allows reads of public profile photos', async () => {
      // Even anonymous users should be able to read photos for public profiles
      const publicRows = await withRlsAnonymous(async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM profile_photos WHERE id = '${publicPhotoId}'`
          )
        );
      });

      expect(publicRows.rows.length).toBe(1);
      expect(publicRows.rows[0]?.id).toBe(publicPhotoId);
    });

    it('prevents anonymous reads of private profile photos', async () => {
      const privateRows = await withRlsAnonymous(async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM profile_photos WHERE id = '${privatePhotoId}'`
          )
        );
      });

      // Anonymous users should not see photos for private profiles
      expect(privateRows.rows.length).toBe(0);
    });
  });
}
