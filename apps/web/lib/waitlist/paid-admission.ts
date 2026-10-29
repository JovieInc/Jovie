import 'server-only';

import { and, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';
import { decideAdmissionForUser } from '@/lib/waitlist/admission-gate.server';

/**
 * A verified paid subscription admits its buyer. Anyone may check out the
 * $199 offer; once Stripe's signed webhook confirms the subscription is
 * active, a still-pending account moves to `waitlist_approved` so the gate
 * never holds a paying customer on the waitlist. The update only matches
 * `waitlist_pending`, so it can never downgrade a further-along user or
 * touch a suspended or banned account.
 *
 * Call only from the verified Stripe webhook path, after the entitlement
 * write has succeeded.
 */
export async function admitPaidUser(input: {
  readonly appUserId: string;
  readonly cacheKeys: readonly string[];
}): Promise<{
  readonly admitted: boolean;
  /** Admission legs that held a paying buyer on the waitlist. */
  readonly heldBy?: readonly string[];
}> {
  // Admission gate (Tim, 2026-10-29): paying does not bypass certification.
  // The subscription and entitlement stay recorded; the account stays
  // pending until profile, golden path and design judge certify, and the
  // hold is logged for operator follow-up.
  const decision = await decideAdmissionForUser(input.appUserId).catch(
    () => null
  );
  if (!decision?.admit) {
    const heldBy = decision?.blocking ?? ['profile', 'golden_path', 'design'];
    logger.warn('[waitlist] paid buyer held by the admission gate', {
      appUserId: input.appUserId,
      heldBy,
    });
    return { admitted: false, heldBy };
  }

  const admitted = await db
    .update(users)
    .set({ userStatus: 'waitlist_approved', updatedAt: new Date() })
    .where(
      and(
        eq(users.id, input.appUserId),
        eq(users.userStatus, 'waitlist_pending')
      )
    )
    .returning({ id: users.id });

  if (admitted.length === 0) return { admitted: false };

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
