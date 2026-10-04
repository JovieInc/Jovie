import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { withSerializableRetry } from '@/lib/db/serializable-retry';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';
import { approveWaitlistEntryInTx } from '@/lib/waitlist/approval';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

/**
 * A verified paid subscription admits its buyer. Anyone may check out the
 * $199 offer; once Stripe's signed webhook confirms the subscription is
 * active, a still-pending account moves to `waitlist_approved` so the gate
 * never holds a paying customer on the waitlist.
 *
 * A buyer with a pending waitlist entry is approved through the same path an
 * operator uses (`approveWaitlistEntryInTx`), which also binds the handle the
 * buyer reserved in /start. No invite email is sent: the buyer is already
 * signed in. Only `waitlist_pending` users match, so this never downgrades a
 * further-along user or touches a suspended or banned account.
 *
 * Call only from the verified Stripe webhook path, after the entitlement
 * write has succeeded.
 */
export async function admitPaidUser(input: {
  readonly appUserId: string;
  readonly cacheKeys: readonly string[];
}): Promise<{ readonly admitted: boolean }> {
  const admitted = await withSerializableRetry(() =>
    withSystemIngestionSession(
      async tx => {
        const [user] = await tx
          .select({ email: users.email, userStatus: users.userStatus })
          .from(users)
          .where(eq(users.id, input.appUserId))
          .for('update')
          .limit(1);
        if (user?.userStatus !== 'waitlist_pending') return false;

        const [entry] = user.email
          ? await tx
              .select({
                id: waitlistEntries.id,
                status: waitlistEntries.status,
              })
              .from(waitlistEntries)
              .where(
                and(
                  eq(waitlistEntries.canonical, true),
                  drizzleSql`${waitlistEntries.emailNormalized} = lower(trim(${user.email}))`
                )
              )
              .limit(1)
          : [];
        if (entry && isWaitlistPendingStatus(entry.status)) {
          const approval = await approveWaitlistEntryInTx(tx, entry.id, {
            actorType: 'system',
            reason: 'paid_checkout',
            targetStatus: 'approved',
          });
          if (approval.outcome === 'approved') return true;
        }

        const updated = await tx
          .update(users)
          .set({ userStatus: 'waitlist_approved', updatedAt: new Date() })
          .where(
            and(
              eq(users.id, input.appUserId),
              eq(users.userStatus, 'waitlist_pending')
            )
          )
          .returning({ id: users.id });
        return updated.length > 0;
      },
      { isolationLevel: 'serializable' }
    )
  );

  if (!admitted) return { admitted: false };

  // The proxy caches gate state per identity; bust every key the buyer may be
  // cached under so the next request is routed as admitted.
  await Promise.all(
    [...new Set([input.appUserId, ...input.cacheKeys])].map(key =>
      invalidateProxyUserStateCache(key).catch(error => {
        logger.warn(
          '[waitlist] paid admission cache invalidation failed',
          error
        );
      })
    )
  );
  return { admitted: true };
}
