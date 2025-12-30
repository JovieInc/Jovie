/**
 * Waitlist access checking
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries, waitlistInvites } from '@/lib/db/schema';
import type { WaitlistAccessResult } from './types';

/**
 * Helper to check waitlist access by email.
 * Returns the waitlist entry status and claim token if available.
 */
export async function checkWaitlistAccess(
  email: string
): Promise<WaitlistAccessResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const [entry] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, normalizedEmail))
    .limit(1);

  if (!entry) {
    return { entryId: null, status: null, claimToken: null };
  }

  // If invited, get the claim token
  if (entry.status === 'invited') {
    const [invite] = await db
      .select({ claimToken: waitlistInvites.claimToken })
      .from(waitlistInvites)
      .where(eq(waitlistInvites.waitlistEntryId, entry.id))
      .limit(1);

    return {
      entryId: entry.id,
      status: entry.status,
      claimToken: invite?.claimToken ?? null,
    };
  }

  return {
    entryId: entry.id,
    status: entry.status,
    claimToken: null,
  };
}
