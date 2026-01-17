import { createHash } from 'crypto';
import { and, count, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  categorySubscriptions,
  emailSuppressions,
  type NewEmailSuppression,
  notificationDeliveryLog,
  type SuppressionMetadata,
} from '@/lib/db/schema';
import { suppressionReasonEnum } from '@/lib/db/schema/enums';
import { logger } from '@/lib/utils/logger';

/**
 * Suppression reason types - derived from canonical enum to prevent drift
 */
export type SuppressionReason =
  (typeof suppressionReasonEnum.enumValues)[number];

/**
 * Result of a suppression check
 */
export interface SuppressionCheckResult {
  suppressed: boolean;
  reason?: SuppressionReason;
  source?: string;
  expiresAt?: Date | null;
}

/**
 * Result of adding a suppression
 */
export interface AddSuppressionResult {
  success: boolean;
  alreadyExists?: boolean;
  id?: string;
  error?: string;
}

/**
 * Hash an email address for privacy-preserving storage and lookup.
 * Uses SHA-256 and normalizes to lowercase before hashing.
 *
 * @param email - The email address to hash
 * @returns SHA-256 hex digest of the normalized email
 */
export function hashEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if an email is suppressed (should not receive notifications).
 * Checks for active suppressions that haven't expired.
 *
 * @param email - The email address to check
 * @returns SuppressionCheckResult with suppression status and details
 */
export async function isEmailSuppressed(
  email: string
): Promise<SuppressionCheckResult> {
  const emailHash = hashEmail(email);
  const now = new Date();

  const suppression = await db.query.emailSuppressions.findFirst({
    where: and(
      eq(emailSuppressions.emailHash, emailHash),
      // Only active suppressions (not expired)
      or(
        isNull(emailSuppressions.expiresAt),
        gt(emailSuppressions.expiresAt, now)
      )
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!suppression) {
    return { suppressed: false };
  }

  return {
    suppressed: true,
    reason: suppression.reason as SuppressionReason,
    source: suppression.source,
    expiresAt: suppression.expiresAt,
  };
}

/**
 * Check if an email is suppressed for a specific category.
 * Returns true if the user has opted out of the category.
 *
 * @param email - The email address to check
 * @param categoryKey - The category key (e.g., 'all_artists')
 * @returns true if suppressed for this category
 */
export async function isCategorySuppressed(
  email: string,
  categoryKey: string
): Promise<boolean> {
  const emailHash = hashEmail(email);

  const subscription = await db.query.categorySubscriptions.findFirst({
    where: and(
      eq(categorySubscriptions.emailHash, emailHash),
      eq(categorySubscriptions.categoryKey, categoryKey)
    ),
  });

  // If no subscription exists, default to not suppressed
  if (!subscription) {
    return false;
  }

  // Suppressed if explicitly unsubscribed
  return !subscription.subscribed;
}

/**
 * Add an email to the global suppression list.
 * Used for bounces, complaints, and manual suppressions.
 *
 * @param email - The email address to suppress
 * @param reason - The reason for suppression
 * @param source - Where the suppression came from (webhook, manual, etc.)
 * @param options - Additional options
 * @returns AddSuppressionResult
 */
export async function addSuppression(
  email: string,
  reason: SuppressionReason,
  source: string,
  options?: {
    sourceEventId?: string;
    metadata?: SuppressionMetadata;
    expiresAt?: Date;
    createdBy?: string;
  }
): Promise<AddSuppressionResult> {
  const emailHash = hashEmail(email);

  try {
    const values: NewEmailSuppression = {
      emailHash,
      reason,
      source,
      sourceEventId: options?.sourceEventId,
      metadata: options?.metadata ?? {},
      expiresAt: options?.expiresAt,
      createdBy: options?.createdBy,
    };

    const [result] = await db
      .insert(emailSuppressions)
      .values(values)
      .onConflictDoNothing({
        target: [emailSuppressions.emailHash, emailSuppressions.reason],
      })
      .returning({ id: emailSuppressions.id });

    if (!result) {
      // Row already exists (conflict)
      return { success: true, alreadyExists: true };
    }

    return { success: true, id: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Remove a suppression (for reversible reasons only).
 * Only user_request suppressions can be removed.
 *
 * @param email - The email address to unsuppress
 * @param reason - The reason to remove (must be reversible)
 * @returns true if suppression was removed
 */
export async function removeSuppression(
  email: string,
  reason: 'user_request'
): Promise<boolean> {
  const emailHash = hashEmail(email);

  const result = await db
    .delete(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.emailHash, emailHash),
        eq(emailSuppressions.reason, reason)
      )
    )
    .returning({ id: emailSuppressions.id });

  return result.length > 0;
}

/**
 * Log a notification delivery attempt.
 * Used for tracking and debugging.
 *
 * @param params - Delivery log parameters
 */
export async function logDelivery(params: {
  notificationSubscriptionId?: string;
  channel: 'email' | 'sms' | 'push';
  recipientEmail?: string;
  recipientPhone?: string;
  status:
    | 'pending'
    | 'sent'
    | 'delivered'
    | 'bounced'
    | 'complained'
    | 'failed'
    | 'suppressed';
  providerMessageId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Compute recipient hash from email or phone
  let recipientHash: string;
  if (params.recipientEmail) {
    recipientHash = hashEmail(params.recipientEmail);
  } else if (params.recipientPhone) {
    recipientHash = hashEmail(params.recipientPhone);
  } else {
    // No recipient identifier provided - log warning and use placeholder
    logger.warn('[logDelivery] No recipient email or phone provided', {
      channel: params.channel,
      status: params.status,
      notificationSubscriptionId: params.notificationSubscriptionId,
    });
    recipientHash = 'unknown';
  }

  try {
    await db.insert(notificationDeliveryLog).values({
      notificationSubscriptionId: params.notificationSubscriptionId,
      channel: params.channel,
      recipientHash,
      status: params.status,
      providerMessageId: params.providerMessageId,
      errorMessage: params.errorMessage,
      metadata: params.metadata ?? {},
    });
  } catch (error) {
    // Log but don't throw - delivery logging is best-effort
    logger.error('[logDelivery] Failed to insert delivery log', {
      error: error instanceof Error ? error.message : 'Unknown error',
      channel: params.channel,
      status: params.status,
      recipientHash,
    });
  }
}

/**
 * Get suppression statistics for admin dashboard.
 *
 * @returns Counts of suppressions by reason
 */
export async function getSuppressionStats(): Promise<
  Record<SuppressionReason, number>
> {
  // Use SQL aggregation instead of fetching all rows
  const results = await db
    .select({
      reason: emailSuppressions.reason,
      count: count(),
    })
    .from(emailSuppressions)
    .groupBy(emailSuppressions.reason);

  // Initialize counts with zeros for all valid reasons
  const counts: Record<SuppressionReason, number> = {
    hard_bounce: 0,
    soft_bounce: 0,
    spam_complaint: 0,
    invalid_address: 0,
    user_request: 0,
    abuse: 0,
    legal: 0,
  };

  // Map SQL results to counts object
  for (const row of results) {
    if (row.reason in counts) {
      counts[row.reason as SuppressionReason] = Number(row.count);
    }
  }

  return counts;
}

/**
 * Clean up expired soft bounce suppressions.
 * Should be run periodically via cron.
 *
 * @returns Number of suppressions removed
 */
export async function cleanupExpiredSuppressions(): Promise<number> {
  const now = new Date();

  const result = await db
    .delete(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.reason, 'soft_bounce'),
        isNotNull(emailSuppressions.expiresAt),
        lt(emailSuppressions.expiresAt, now)
      )
    )
    .returning({ id: emailSuppressions.id });

  return result.length;
}
