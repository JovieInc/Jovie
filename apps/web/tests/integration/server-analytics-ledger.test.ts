import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test verifies the real migrated schema and database */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackServerEvent } from '@/lib/server-analytics';
import { setupDatabaseBeforeAll } from '../setup-db';

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

describe.skipIf(!process.env.DATABASE_URL)(
  'server analytics ledger (integration)',
  () => {
    const profileId = randomUUID();
    let db: TestDb;

    beforeAll(async () => {
      const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
      if (!connection) {
        throw new Error('Database connection not initialized');
      }
      db = connection;
      await db.insert(creatorProfiles).values({
        id: profileId,
        creatorType: 'creator',
        username: `analytics-${profileId}`,
        usernameNormalized: `analytics-${profileId}`,
        isClaimed: true,
        isPublic: false,
      });
    });

    afterAll(async () => {
      if (!db) return;
      await db
        .delete(serverAnalyticsEvents)
        .where(eq(serverAnalyticsEvents.sourceEntityId, profileId));
      await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));
    });

    it('persists and reads a source-reconcilable row through the production sink', async () => {
      const delivery = await trackServerEvent('dashboard_profile_updated', {
        profileId,
      });

      expect(delivery.ok).toBe(true);
      if (!delivery.ok) return;

      const [stored] = await db
        .select()
        .from(serverAnalyticsEvents)
        .where(eq(serverAnalyticsEvents.id, delivery.eventId));
      expect(stored).toMatchObject({
        contractVersion: 'server-analytics/v1',
        eventName: 'dashboard_profile_updated',
        sourceEntityType: 'creator_profile',
        sourceEntityId: profileId,
      });

      const [source] = await db
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, stored?.sourceEntityId ?? ''));
      expect(source?.id).toBe(profileId);
    });
  }
);
