import { sql as drizzleSql } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { beforeAll, describe, expect, it } from 'vitest';
import type * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import {
  setupDatabaseBeforeAll,
  withRlsAnonymous,
  withRlsUser,
} from '../setup-db';

/**
 * RLS Access Control Tests (JOV-4194 / JOV-4195)
 *
 * Verifies the RLS policies shipped by the real Drizzle migrations
 * (0001 + 0036 + 0075) — NOT test-authored policy copies. Enforcement is
 * exercised through the NOBYPASSRLS `test_app_user` role via withRlsUser /
 * withRlsAnonymous, with the `app.clerk_user_id` session variable carrying
 * the app `users.id` UUID exactly as lib/auth/session.ts writes it.
 *
 * Policies under test:
 * - users: self-only select/update/insert keyed on users.id
 * - creator_profiles: public read; owner-only otherwise
 * - profile_photos: public read via public profile; owner-only otherwise
 */

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('RLS access control (database)', () => {
  let db: TestDb;
  let userAId: string;
  let userBId: string;
  let publicProfileId: string;
  let privateProfileId: string;
  let publicPhotoId: string;
  let privatePhotoId: string;

  beforeAll(async () => {
    const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
    if (!connection) {
      throw new Error(
        'Database connection not initialized for RLS integration tests'
      );
    }
    db = connection;

    const now = Date.now();

    const [userA, userB] = await db
      .insert(users)
      .values([
        { clerkId: `rls_user_a_${now}`, userStatus: 'active' },
        { clerkId: `rls_user_b_${now}`, userStatus: 'active' },
      ])
      .returning({ id: users.id });

    userAId = userA.id;
    userBId = userB.id;

    const [publicProfile, privateProfile] = await db
      .insert(creatorProfiles)
      .values([
        {
          userId: userAId,
          creatorType: 'artist',
          username: `rls-public-${now}`,
          usernameNormalized: `rls-public-${now}`,
          isPublic: true,
        },
        {
          userId: userBId,
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
          userId: userAId,
          creatorProfileId: publicProfileId,
          status: 'ready',
          blobUrl: 'https://public-avatar.test/original.webp',
        },
        {
          userId: userBId,
          creatorProfileId: privateProfileId,
          status: 'ready',
          blobUrl: 'https://private-avatar.test/original.webp',
        },
      ])
      .returning({ id: profilePhotos.id });

    publicPhotoId = publicPhoto.id;
    privatePhotoId = privatePhoto.id;
  });

  describe('users table', () => {
    it('allows a user to read their own row', async () => {
      const rows = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(`SELECT id FROM users WHERE id = '${userAId}'`)
        )
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(userAId);
    });

    it("denies reading another user's row", async () => {
      const rows = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(`SELECT id FROM users WHERE id = '${userBId}'`)
        )
      );
      expect(rows.rows.length).toBe(0);
    });

    it("denies updating another user's row", async () => {
      const updated = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `UPDATE users SET email = 'stolen@rls.test' WHERE id = '${userBId}' RETURNING id`
          )
        )
      );
      expect(updated.rows.length).toBe(0);
    });

    it('denies anonymous reads of users', async () => {
      const rows = await withRlsAnonymous(async tx =>
        tx.execute(
          drizzleSql.raw(`SELECT id FROM users WHERE id = '${userAId}'`)
        )
      );
      expect(rows.rows.length).toBe(0);
    });
  });

  describe('creator_profiles table', () => {
    it("denies reading another user's private profile", async () => {
      const rows = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(0);
    });

    it('allows the owner to read their own private profile', async () => {
      const rows = await withRlsUser(userBId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(privateProfileId);
    });

    it("denies updating another user's profile", async () => {
      const updated = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `UPDATE creator_profiles SET display_name = 'unauthorized-update' WHERE id = '${privateProfileId}' RETURNING id`
          )
        )
      );
      expect(updated.rows.length).toBe(0);
    });

    it('allows the owner to update their own profile', async () => {
      const updated = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `UPDATE creator_profiles SET display_name = 'owner-update' WHERE id = '${publicProfileId}' RETURNING id`
          )
        )
      );
      expect(updated.rows.length).toBe(1);
    });

    it('allows anonymous reads of public profiles', async () => {
      const rows = await withRlsAnonymous(async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${publicProfileId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(publicProfileId);
    });

    it('denies anonymous reads of private profiles', async () => {
      const rows = await withRlsAnonymous(async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM creator_profiles WHERE id = '${privateProfileId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(0);
    });
  });

  describe('profile_photos table', () => {
    it('allows anonymous reads of photos on public profiles', async () => {
      const rows = await withRlsAnonymous(async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM profile_photos WHERE id = '${publicPhotoId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0]?.id).toBe(publicPhotoId);
    });

    it('denies anonymous reads of photos on private profiles', async () => {
      const rows = await withRlsAnonymous(async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM profile_photos WHERE id = '${privatePhotoId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(0);
    });

    it('allows the owner to read their private-profile photo', async () => {
      const rows = await withRlsUser(userBId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `SELECT id FROM profile_photos WHERE id = '${privatePhotoId}'`
          )
        )
      );
      expect(rows.rows.length).toBe(1);
    });

    it("denies updating another user's photo", async () => {
      const updated = await withRlsUser(userAId, async tx =>
        tx.execute(
          drizzleSql.raw(
            `UPDATE profile_photos SET blob_url = 'https://hijacked.test/x.webp' WHERE id = '${privatePhotoId}' RETURNING id`
          )
        )
      );
      expect(updated.rows.length).toBe(0);
    });
  });
});
