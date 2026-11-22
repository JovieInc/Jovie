import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { createReviewInboxLedger, type ReviewInboxRepository } from './ledger';

/**
 * Review marks live in the existing Ovie operating KV (no new table). Scope is
 * encoded in the key and verified in the value; writes are compare-and-set on
 * the record's integer `revision`.
 */
export const reviewInboxRepository: ReviewInboxRepository = {
  async read(key) {
    const [row] = await db
      .select({ value: ovieOperatingKv.value })
      .from(ovieOperatingKv)
      .where(eq(ovieOperatingKv.key, key))
      .limit(1);
    return row?.value ?? null;
  },
  async compareAndSet(key, expectedRevision, value) {
    if (expectedRevision === null) {
      const rows = await db
        .insert(ovieOperatingKv)
        .values({ key, value })
        .onConflictDoNothing()
        .returning({ key: ovieOperatingKv.key });
      return rows.length === 1;
    }
    const rows = await db
      .update(ovieOperatingKv)
      .set({ value, updatedAt: new Date() })
      .where(
        and(
          eq(ovieOperatingKv.key, key),
          drizzleSql`${ovieOperatingKv.value}->>'revision' = ${String(expectedRevision)}`
        )
      )
      .returning({ key: ovieOperatingKv.key });
    return rows.length === 1;
  },
};

export const reviewInboxLedger = createReviewInboxLedger(reviewInboxRepository);
