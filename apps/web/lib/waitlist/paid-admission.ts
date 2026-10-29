import 'server-only';

import { and, eq } from 'drizzle-orm';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { refundFirstMonthAndCancel } from '@/lib/stripe/claim-rejection-refund';
import { logger } from '@/lib/utils/logger';
import { readPaymentAdmissionHold } from '@/lib/waitlist/admission-gate.server';

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
  /** The paying subscription, refunded if the admission gate holds the buyer. */
  readonly subscriptionId: string;
}): Promise<{
  readonly admitted: boolean;
  /** Admission legs that held a waiting buyer; their payment was refunded. */
  readonly heldBy?: readonly string[];
  readonly refunded?: boolean;
}> {
  // Admission gate (Tim, 2026-10-29): paying does not bypass certification,
  // and we never keep money from someone we will not admit. Checkout refuses
  // a held buyer up front; this is the backstop for a race or a stale
  // session: refund in full, cancel, record why, raise a Summer incident.
  const heldBy = await readPaymentAdmissionHold(input.appUserId).catch(
    () => ['profile', 'golden_path', 'design'] as const
  );
  if (heldBy) {
    await refundHeldBuyer({ ...input, heldBy });
    return { admitted: false, heldBy, refunded: true };
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

async function refundHeldBuyer(input: {
  readonly appUserId: string;
  readonly subscriptionId: string;
  readonly heldBy: readonly string[];
}): Promise<void> {
  const reason = `admission_gate_closed: ${input.heldBy.join(', ')}`;
  try {
    const refund = await refundFirstMonthAndCancel({
      subscriptionId: input.subscriptionId,
      idempotencyKey: `admission-gate-refund:${input.appUserId}:${input.subscriptionId}`,
      source: 'admission_gate_closed',
    });
    logger.warn('[waitlist] refunded a waiting buyer the gate holds', {
      appUserId: input.appUserId,
      subscriptionId: input.subscriptionId,
      refundId: refund.refundId,
      amount: refund.amount,
      reason,
    });
    await raiseHeldPaymentIncident({ ...input, reason, refunded: true });
  } catch (error) {
    // Never swallow: the webhook fails so Stripe retries the (idempotent)
    // refund, and the incident says money is held until it succeeds.
    await raiseHeldPaymentIncident({ ...input, reason, refunded: false });
    throw error;
  }
}

async function raiseHeldPaymentIncident(input: {
  readonly appUserId: string;
  readonly subscriptionId: string;
  readonly reason: string;
  readonly refunded: boolean;
}): Promise<void> {
  try {
    const { submitSummerCard } = await import('@/lib/ovie/summer-cards.server');
    // Account and subscription ids only; no email or other PII.
    await submitSummerCard({
      idempotencyKey:
        `admission-gate-payment-${input.subscriptionId}-${input.refunded ? 'refunded' : 'pending'}`.slice(
          0,
          128
        ),
      kind: 'decision',
      product: 'jov',
      title: input.refunded
        ? 'Incident: waiting buyer charged, refunded in full'
        : 'Incident: waiting buyer charged, refund failing',
      body: [
        `Account ${input.appUserId} paid (subscription ${input.subscriptionId}) while the admission gate held them (${input.reason}).`,
        input.refunded
          ? 'The payment was refunded in full and the subscription canceled.'
          : 'The automatic refund failed; Stripe retries the webhook. Refund manually if it keeps failing.',
        'Checkout refuses held buyers, so this means a race or a stale checkout session.',
      ].join('\n'),
      recommendation:
        'Find how checkout opened for a held buyer and close that path.',
      defaultIfSilent: 'No further action; the refund stands.',
      recipient: null,
      amountUsd: null,
      preflightReceiptId: null,
      evidence: [`stripe-subscription:${input.subscriptionId}`],
      decideBy: null,
      defaultDecision: 'none',
    });
  } catch (error) {
    logger.error('[waitlist] could not raise the held-payment incident', {
      appUserId: input.appUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
