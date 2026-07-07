import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { normalizeEmail } from '@/lib/utils/email';

export type SyncClerkIdOutcome =
  | { kind: 'no_db_row' }
  | { kind: 'in_sync' }
  | {
      kind: 'synced';
      userId: string;
      oldClerkId: string | null;
      newClerkId: string;
    }
  | { kind: 'ambiguous_email'; matchCount: number }
  | { kind: 'clerk_id_taken'; existingUserId: string };

/**
 * Align `users.clerk_id` with the caller's current Clerk session for the given
 * verified email. Used by both the dev toolbar's Sync Clerk action and any
 * future recovery flow that needs to heal dev/prod Clerk-id drift.
 *
 * Fail-safe rules (audit JOV-2999):
 * - Never rebind using an arbitrary first email match; target a single row by id.
 * - Refuse when multiple DB rows share the email.
 * - Refuse when the session clerk_id is already bound to a different user row.
 *
 * Returns a structured outcome instead of HTTP codes so callers can render
 * whatever surface is appropriate (JSON, toast, redirect).
 */
export async function syncClerkIdForEmail(
  email: string,
  clerkUserId: string
): Promise<SyncClerkIdOutcome> {
  const normalizedEmail = normalizeEmail(email);

  const [clerkIdOwner] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (clerkIdOwner) {
    const ownerEmail = clerkIdOwner.email
      ? normalizeEmail(clerkIdOwner.email)
      : null;
    if (ownerEmail === normalizedEmail) {
      return { kind: 'in_sync' };
    }
    return { kind: 'clerk_id_taken', existingUserId: clerkIdOwner.id };
  }

  const emailMatches = await db
    .select({ id: users.id, clerkId: users.clerkId })
    .from(users)
    .where(eq(users.email, normalizedEmail));

  if (emailMatches.length === 0) {
    return { kind: 'no_db_row' };
  }

  if (emailMatches.length > 1) {
    return { kind: 'ambiguous_email', matchCount: emailMatches.length };
  }

  const [existing] = emailMatches;

  if (existing.clerkId === clerkUserId) {
    return { kind: 'in_sync' };
  }

  await db
    .update(users)
    .set({ clerkId: clerkUserId, updatedAt: new Date() })
    .where(eq(users.id, existing.id));

  return {
    kind: 'synced',
    userId: existing.id,
    oldClerkId: existing.clerkId,
    newClerkId: clerkUserId,
  };
}
