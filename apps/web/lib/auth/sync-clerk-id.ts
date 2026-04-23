import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

export type SyncClerkIdOutcome =
  | { kind: 'no_db_row' }
  | { kind: 'in_sync' }
  | { kind: 'synced'; oldClerkId: string; newClerkId: string };

/**
 * Align `users.clerk_id` with the caller's current Clerk session for the given
 * email. Used by both the dev toolbar's Sync Clerk action and any future
 * recovery flow that needs to heal dev/prod Clerk-id drift.
 *
 * Returns a structured outcome instead of HTTP codes so callers can render
 * whatever surface is appropriate (JSON, toast, redirect).
 */
export async function syncClerkIdForEmail(
  email: string,
  clerkUserId: string
): Promise<SyncClerkIdOutcome> {
  const [existing] = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing) {
    return { kind: 'no_db_row' };
  }

  if (existing.clerkId === clerkUserId) {
    return { kind: 'in_sync' };
  }

  await db
    .update(users)
    .set({ clerkId: clerkUserId, updatedAt: new Date() })
    .where(eq(users.email, email));

  return {
    kind: 'synced',
    oldClerkId: existing.clerkId,
    newClerkId: clerkUserId,
  };
}
