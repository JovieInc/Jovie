import { inArray, sql as drizzleSql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema';
import { setupDatabaseBeforeAll } from '../setup-db';

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

const db = (globalThis as typeof globalThis & { db?: TestDb }).db;

if (!db) {
  describe.skip('users email uniqueness (database)', () => {
    it('skips because no database connection is configured', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const connectedDb = db as TestDb;
  const createdClerkIds: string[] = [];

  afterEach(async () => {
    if (createdClerkIds.length === 0) {
      return;
    }

    await connectedDb
      .delete(users)
      .where(inArray(users.clerkId, createdClerkIds));
    createdClerkIds.length = 0;
  });

  async function insertUser(clerkId: string, email: string | null) {
    createdClerkIds.push(clerkId);

    await connectedDb.transaction(async tx => {
      await tx.execute(
        drizzleSql.raw(`SET LOCAL app.user_id = '${clerkId}'`)
      );
      await tx.execute(
        drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${clerkId}'`)
      );
      await tx.insert(users).values({
        clerkId,
        email,
        userStatus: 'active',
      });
    });
  }

  describe('users email uniqueness (database)', () => {
    it('rejects duplicate emails regardless of case', async () => {
      const now = Date.now();
      const email = `CaseTest-${now}@example.com`;

      await insertUser(`case-user-${now}-a`, email);

      await expect(
        insertUser(`case-user-${now}-b`, email.toLowerCase())
      ).rejects.toMatchObject({
        message: expect.stringContaining('idx_users_email_unique'),
      });
    });

    it('allows multiple users with NULL emails', async () => {
      const now = Date.now();

      await insertUser(`null-email-${now}-a`, null);
      await insertUser(`null-email-${now}-b`, null);
    });
  });
}
