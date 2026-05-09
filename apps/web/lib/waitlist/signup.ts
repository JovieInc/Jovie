import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { insertWaitlistAuditLog } from '@/lib/waitlist/audit';
import { enqueueSignedUpWelcomeEmail } from '@/lib/waitlist/email-jobs';
import { isStatusUpgrade } from '@/lib/waitlist/status-precedence';

export async function markWaitlistSignedUpInTx(
  tx: DbOrTransaction,
  clerkUserId: string
): Promise<{ entryId: string | null }> {
  const now = new Date();
  const [user] = await tx
    .select({
      id: users.id,
      email: users.email,
      userStatus: users.userStatus,
      waitlistEntryId: users.waitlistEntryId,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .for('update')
    .limit(1);

  if (!user) return { entryId: null };

  const nextUserStatus = isStatusUpgrade(user.userStatus, 'active')
    ? 'active'
    : user.userStatus;

  await tx
    .update(users)
    .set({ userStatus: nextUserStatus, updatedAt: now })
    .where(eq(users.id, user.id));

  const [entry] = await tx
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(
      user.waitlistEntryId
        ? eq(waitlistEntries.id, user.waitlistEntryId)
        : drizzleSql`lower(${waitlistEntries.email}) = lower(${user.email})`
    )
    .for('update')
    .limit(1);

  if (!entry) return { entryId: null };

  if (entry.status !== 'signed_up') {
    await tx
      .update(waitlistEntries)
      .set({
        status: 'signed_up',
        signedUpAt: now,
        inviteTokenRedeemedAt: now,
        statusReason: 'onboarding_completed',
        updatedAt: now,
      })
      .where(eq(waitlistEntries.id, entry.id));

    await insertWaitlistAuditLog(tx, {
      waitlistEntryId: entry.id,
      fromStatus: entry.status,
      toStatus: 'signed_up',
      actorUserId: clerkUserId,
      actorType: 'user',
      reason: 'onboarding_completed',
    });
  }

  await enqueueSignedUpWelcomeEmail(tx, entry.id);
  return { entryId: entry.id };
}
