import { eq } from 'drizzle-orm';
import { kickQueue } from '@/lib/cron/kick-queue';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { ingestionJobs } from '@/lib/db/schema/ingestion';

/** Deduplicate against the partial unique index, retaining concurrent winners after 23505 races. */
export async function insertJobWithDedup(
  values: typeof ingestionJobs.$inferInsert
): Promise<string | null> {
  const dedupKey = values.dedupKey;
  let caughtUniqueViolation: Error | undefined;

  try {
    const result = await db
      .insert(ingestionJobs)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: ingestionJobs.id });

    if (result.length > 0) {
      kickQueue('ingestion');
      return result[0].id;
    }
  } catch (error: unknown) {
    // PostgreSQL unique_violation (23505) from the partial index race condition
    if (!isUniqueViolation(error)) {
      throw error;
    }
    caughtUniqueViolation = error as Error;
  }

  // Race condition: another concurrent insert won — return the existing job's id
  if (!dedupKey) return null;
  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, dedupKey))
    .limit(1);

  if (winner?.id) {
    return winner.id;
  }

  // If we caught a 23505 but the winner row has vanished, surface the original
  // error instead of silently returning null — this indicates an anomaly.
  if (caughtUniqueViolation) {
    throw caughtUniqueViolation;
  }

  return null;
}
