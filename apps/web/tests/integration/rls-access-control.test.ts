import { sql as drizzleSql, eq } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { tips } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
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
    it.todo('skips because no database connection is configured');
  });
} else {
  describe('RLS access control (database)', () => {
    let userAClerkId: string;
    let userBClerkId: string;
    let userAId: string;
    let userBId: string;
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
      userAId = userA.id;
      userBId = userB.id;

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

    it('prevents non-owners from reading billing audit rows (JOV-3061)', async () => {
      const [audit] = await db
        .insert(billingAuditLog)
        .values({
          userId: userAId,
          eventType: 'rls_test',
          source: 'test',
        })
        .returning({ id: billingAuditLog.id });

      const asB = await withRlsUser(userBClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM billing_audit_log WHERE id = '${audit.id}'`
          )
        );
      });
      expect(asB.rows.length).toBe(0);
    });

    it('prevents non-owners from reading another user chat conversation (JOV-3061)', async () => {
      const [conversation] = await db
        .insert(chatConversations)
        .values({
          userId: userBId,
          creatorProfileId: privateProfileId,
          title: 'private-rls-chat',
        })
        .returning({ id: chatConversations.id });

      await db.insert(chatMessages).values({
        conversationId: conversation.id,
        role: 'user',
        content: 'secret message',
      });

      const asA = await withRlsUser(userAClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM chat_conversations WHERE id = '${conversation.id}'`
          )
        );
      });
      expect(asA.rows.length).toBe(0);

      const messagesAsA = await withRlsUser(userAClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(
            `SELECT id FROM chat_messages WHERE conversation_id = '${conversation.id}'`
          )
        );
      });
      expect(messagesAsA.rows.length).toBe(0);
    });

    it('prevents non-owners from reading tips for another creator (JOV-3061)', async () => {
      const [tip] = await db
        .insert(tips)
        .values({
          creatorProfileId: privateProfileId,
          amountCents: 500,
          paymentIntentId: `pi_rls_${Date.now()}`,
          status: 'completed',
        })
        .returning({ id: tips.id });

      const asA = await withRlsUser(userAClerkId, async tx => {
        return tx.execute(
          drizzleSql.raw(`SELECT id FROM tips WHERE id = '${tip.id}'`)
        );
      });
      expect(asA.rows.length).toBe(0);

      // Sanity: row exists for the privileged test connection
      const [row] = await db
        .select({ id: tips.id })
        .from(tips)
        .where(eq(tips.id, tip.id))
        .limit(1);
      expect(row?.id).toBe(tip.id);
    });
  });
}
