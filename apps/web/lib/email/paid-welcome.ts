/**
 * Paid-welcome fulfillment email (JOV-6445).
 *
 * Sends one idempotent confirmation after a verified paid subscription
 * grants entitlement. Default-off via PAID_WELCOME_EMAIL — Tim must
 * publish the prod override and approve the first live send.
 */

import 'server-only';
import { and, sql as drizzleSql, eq, lt, or } from 'drizzle-orm';
import type Stripe from 'stripe';

import { SUPPORT_EMAIL } from '@/constants/domains';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { sendEmail } from '@/lib/email/send';
import { getPaidWelcomeEmail } from '@/lib/email/templates/paid-welcome';
import { resolveSafeFirstName } from '@/lib/email/templates/personalization';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { getFlagOverrideMap } from '@/lib/flags/overrides-store.server';
import { logDelivery } from '@/lib/notifications/suppression';
import { getPriceMappingDetails } from '@/lib/stripe/config';
import { logger } from '@/lib/utils/logger';

export const PAID_WELCOME_JOB_TYPE = 'send_paid_welcome';
export const PAID_WELCOME_DEDUP_PREFIX = 'send_paid_welcome:';
const PAID_WELCOME_SCHEDULER_PARK_AT = new Date('2099-01-01T00:00:00.000Z');
const STALE_PROCESSING_MS = 2 * 60 * 1000;

export type PaidWelcomeResult =
  | { status: 'sent'; messageId?: string; jobId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

export function buildPaidWelcomeDedupKey(subscriptionId: string): string {
  return `${PAID_WELCOME_DEDUP_PREFIX}${subscriptionId}`;
}

export function isPaidSubscriptionStatus(
  status: Stripe.Subscription.Status
): boolean {
  return status === 'active';
}

export async function isPaidWelcomeEmailEnabled(): Promise<boolean> {
  try {
    const overrides = await getFlagOverrideMap();
    if (overrides.PAID_WELCOME_EMAIL !== undefined) {
      return overrides.PAID_WELCOME_EMAIL;
    }
  } catch {
    // Override store can throw outside a Next request. Stay on the code default.
  }
  return APP_FLAG_DEFAULTS.PAID_WELCOME_EMAIL;
}

async function claimPaidWelcomeJob(input: {
  subscriptionId: string;
  appUserId: string;
  clerkUserId: string;
  offerName: string;
}): Promise<{ id: string } | null> {
  const dedupKey = buildPaidWelcomeDedupKey(input.subscriptionId);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  await db
    .insert(ingestionJobs)
    .values({
      jobType: PAID_WELCOME_JOB_TYPE,
      payload: {
        kind: PAID_WELCOME_JOB_TYPE,
        subscriptionId: input.subscriptionId,
        appUserId: input.appUserId,
        clerkUserId: input.clerkUserId,
        offerName: input.offerName,
      },
      status: 'pending',
      runAt: PAID_WELCOME_SCHEDULER_PARK_AT,
      maxAttempts: 3,
      dedupKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const [claimed] = await db
    .update(ingestionJobs)
    .set({
      status: 'processing',
      attempts: drizzleSql`${ingestionJobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(ingestionJobs.dedupKey, dedupKey),
        or(
          eq(ingestionJobs.status, 'pending'),
          eq(ingestionJobs.status, 'failed'),
          and(
            eq(ingestionJobs.status, 'processing'),
            lt(ingestionJobs.updatedAt, staleBefore)
          )
        )
      )
    )
    .returning({ id: ingestionJobs.id });

  return claimed ?? null;
}

async function markPaidWelcomeJob(input: {
  jobId: string;
  status: 'succeeded' | 'failed';
  messageId?: string;
  error?: string;
}): Promise<void> {
  const now = new Date();
  await db
    .update(ingestionJobs)
    .set({
      status: input.status,
      error: input.error ?? null,
      payload: {
        kind: PAID_WELCOME_JOB_TYPE,
        messageId: input.messageId ?? null,
        completedAt: now.toISOString(),
      },
      updatedAt: now,
    })
    .where(eq(ingestionJobs.id, input.jobId));
}

async function loadRecipient(appUserId: string): Promise<{
  email: string;
  name: string | null;
} | null> {
  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);

  if (!user?.email) return null;
  return { email: user.email, name: user.name ?? null };
}

function resolveOfferName(
  subscription: Stripe.Subscription,
  plan?: string
): string {
  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId) {
    const details = getPriceMappingDetails(priceId);
    if (details?.description) return details.description;
  }
  if (plan === 'max' || plan === 'growth') return 'Max';
  if (plan === 'pro') return 'Pro';
  return 'Pro';
}

/**
 * After billing entitlement is true, send one paid-welcome email.
 * Safe to call from checkout + subscription created/updated retries.
 */
export async function maybeSendPaidWelcomeAfterEntitlement(input: {
  appUserId: string;
  clerkUserId: string;
  subscription: Stripe.Subscription;
  plan?: string;
}): Promise<PaidWelcomeResult> {
  if (!isPaidSubscriptionStatus(input.subscription.status)) {
    return {
      status: 'skipped',
      reason: `subscription_status_${input.subscription.status}`,
    };
  }

  const enabled = await isPaidWelcomeEmailEnabled();
  if (!enabled) {
    logger.info('Paid welcome email skipped — flag off', {
      subscriptionId: input.subscription.id,
    });
    return { status: 'skipped', reason: 'flag_off' };
  }

  const offerName = resolveOfferName(input.subscription, input.plan);
  const claimed = await claimPaidWelcomeJob({
    subscriptionId: input.subscription.id,
    appUserId: input.appUserId,
    clerkUserId: input.clerkUserId,
    offerName,
  });

  if (!claimed) {
    logger.info('Paid welcome email already claimed or sent', {
      subscriptionId: input.subscription.id,
    });
    return { status: 'skipped', reason: 'already_sent' };
  }

  const recipient = await loadRecipient(input.appUserId);
  if (!recipient) {
    await markPaidWelcomeJob({
      jobId: claimed.id,
      status: 'failed',
      error: 'No email found for user',
    });
    return { status: 'failed', error: 'No email found for user' };
  }

  const firstName = resolveSafeFirstName(
    recipient.name,
    recipient.email.split('@')[0] ?? ''
  );
  const emailContent = getPaidWelcomeEmail({
    firstName,
    offerName,
  });
  const idempotencyKey = buildPaidWelcomeDedupKey(input.subscription.id);

  const sendResult = await sendEmail({
    to: recipient.email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    replyTo: SUPPORT_EMAIL,
    idempotencyKey,
  });

  if (!sendResult.success) {
    await markPaidWelcomeJob({
      jobId: claimed.id,
      status: 'failed',
      error: sendResult.error ?? 'Email send failed',
    });
    await logDelivery({
      channel: 'email',
      recipientEmail: recipient.email,
      status: 'failed',
      errorMessage: sendResult.error,
      metadata: { notificationType: 'paid_welcome' },
    });
    return { status: 'failed', error: sendResult.error ?? 'Email send failed' };
  }

  await markPaidWelcomeJob({
    jobId: claimed.id,
    status: 'succeeded',
    messageId: sendResult.messageId,
  });
  await logDelivery({
    channel: 'email',
    recipientEmail: recipient.email,
    status: 'sent',
    providerMessageId: sendResult.messageId,
    metadata: { notificationType: 'paid_welcome' },
  });

  logger.info('Sent paid welcome email', {
    subscriptionId: input.subscription.id,
    jobId: claimed.id,
    messageId: sendResult.messageId,
  });

  return {
    status: 'sent',
    messageId: sendResult.messageId,
    jobId: claimed.id,
  };
}

/**
 * Fire-and-forget wrapper for webhook handlers. Never throws into billing.
 */
export function enqueuePaidWelcomeAfterEntitlement(input: {
  appUserId: string;
  clerkUserId: string;
  subscription: Stripe.Subscription;
  plan?: string;
}): void {
  void maybeSendPaidWelcomeAfterEntitlement(input).catch(error => {
    logger.warn('Paid welcome email failed', {
      subscriptionId: input.subscription.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });
}
