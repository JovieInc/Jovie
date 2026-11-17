import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

/**
 * One founder welcome per person. `users.founder_welcome_sent_at` is the
 * marker the signup welcome (lib/waitlist/email-jobs.ts) already checks, so
 * stamping it after a sent admission welcome makes the signup one skip.
 * Never overwrites an earlier stamp.
 */
export async function markFounderWelcomeSent(
  waitlistEntryId: string,
  now: Date
): Promise<void> {
  await db
    .update(users)
    .set({ founderWelcomeSentAt: now, updatedAt: now })
    .where(
      and(
        eq(users.waitlistEntryId, waitlistEntryId),
        isNull(users.founderWelcomeSentAt)
      )
    );
}
