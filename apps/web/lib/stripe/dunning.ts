/**
 * Dunning and Recovery Service
 *
 * Handles payment failure notifications and recovery emails.
 * Integrates with the Stripe webhook handler to send appropriate emails.
 *
 * Dunning Flow:
 * 1. First payment failure: Send initial notice
 * 2. Second failure: Send follow-up with increased urgency
 * 3. Third+ failure: Send final notice before cancellation
 * 4. Payment recovery: Send confirmation that access is restored
 */

import 'server-only';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  getPaymentFailedHtml,
  getPaymentFailedSubject,
  getPaymentFailedText,
  type PaymentFailedTemplateData,
} from '@/lib/email/templates/payment-failed';
import {
  getPaymentRecoveredHtml,
  getPaymentRecoveredSubject,
  getPaymentRecoveredText,
  type PaymentRecoveredTemplateData,
} from '@/lib/email/templates/payment-recovered';
import { captureError } from '@/lib/error-tracking';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { logger } from '@/lib/utils/logger';

import { createBillingPortalSession } from './client';
import { getPriceMappingDetails } from './config';

/**
 * Shared email provider instance (singleton).
 */
let emailProviderInstance: ResendEmailProvider | null = null;

function getEmailProvider(): ResendEmailProvider {
  emailProviderInstance ??= new ResendEmailProvider();
  return emailProviderInstance;
}

/**
 * Information about a failed payment
 */
export interface PaymentFailureInfo {
  /** Clerk user ID */
  userId: string;
  /** Amount due in cents */
  amountDue: number;
  /** Currency code */
  currency: string;
  /** Number of payment attempts */
  attemptCount: number;
  /** Invoice ID */
  invoiceId: string;
  /** Price ID for the subscription */
  priceId?: string;
  /** Stripe customer ID */
  customerId?: string;
}

/**
 * Information about a recovered payment
 */
export interface PaymentRecoveryInfo {
  /** Clerk user ID */
  userId: string;
  /** Amount paid in cents */
  amountPaid: number;
  /** Currency code */
  currency: string;
  /** Price ID for the subscription */
  priceId?: string;
}

/**
 * Get user email from Clerk user ID
 */
async function getUserEmail(userId: string): Promise<{
  email: string | null;
  name: string | null;
}> {
  try {
    const [user] = await db
      .select({
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
    };
  } catch (error) {
    captureError('Error fetching user for dunning email', error, { userId });
    return { email: null, name: null };
  }
}

/**
 * Get plan name from price ID
 */
function getPlanName(priceId?: string): string {
  if (!priceId) return 'Pro';
  const details = getPriceMappingDetails(priceId);
  return details?.description ?? 'Pro';
}

/**
 * Calculate days remaining based on Stripe's dunning schedule
 * Stripe typically retries for 3-4 weeks before cancelling
 */
function calculateDaysRemaining(attemptCount: number): number {
  // Stripe's default schedule: retries at day 1, 3, 5, 7
  // After ~7 days, subscription is cancelled if still unpaid
  // Adjust this based on your Stripe dunning settings
  const maxDays = 7;
  const daysPerAttempt = 2;
  const daysUsed = Math.min(attemptCount * daysPerAttempt, maxDays);
  return Math.max(1, maxDays - daysUsed);
}

/**
 * Send a payment failed notification email
 */
export async function sendPaymentFailedEmail(
  info: PaymentFailureInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, name } = await getUserEmail(info.userId);

    if (!email) {
      logger.warn('No email found for user, skipping dunning email', {
        userId: info.userId,
      });
      return { success: false, error: 'No email found for user' };
    }

    // Get billing portal URL if we have customer ID
    let portalUrl: string | undefined;
    if (info.customerId) {
      try {
        const portalSession = await createBillingPortalSession({
          customerId: info.customerId,
          returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/app/billing`,
        });
        portalUrl = portalSession.url ?? undefined;
      } catch {
        // Portal URL is optional, continue without it
      }
    }

    const templateData: PaymentFailedTemplateData = {
      userName: name || email.split('@')[0],
      amountDue: info.amountDue,
      currency: info.currency,
      attemptCount: info.attemptCount,
      planName: getPlanName(info.priceId),
      invoiceId: info.invoiceId,
      portalUrl,
      daysRemaining: calculateDaysRemaining(info.attemptCount),
    };

    const provider = getEmailProvider();
    const result = await provider.sendEmail({
      to: email,
      subject: getPaymentFailedSubject(templateData),
      text: getPaymentFailedText(templateData),
      html: getPaymentFailedHtml(templateData),
    });

    if (result.status === 'error') {
      logger.error('Failed to send payment failed email', {
        userId: info.userId,
        error: result.error,
      });
      return { success: false, error: result.error };
    }

    if (result.status === 'skipped') {
      logger.warn('Payment failed email skipped', {
        userId: info.userId,
        detail: result.detail,
      });
      return { success: false, error: result.detail };
    }

    logger.info('Sent payment failed email', {
      userId: info.userId,
      attemptCount: info.attemptCount,
      messageId: result.detail,
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    captureError('Error sending payment failed email', error, {
      userId: info.userId,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a payment recovered notification email
 */
export async function sendPaymentRecoveredEmail(
  info: PaymentRecoveryInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    const { email, name } = await getUserEmail(info.userId);

    if (!email) {
      logger.warn('No email found for user, skipping recovery email', {
        userId: info.userId,
      });
      return { success: false, error: 'No email found for user' };
    }

    const templateData: PaymentRecoveredTemplateData = {
      userName: name || email.split('@')[0],
      amountPaid: info.amountPaid,
      currency: info.currency,
      planName: getPlanName(info.priceId),
    };

    const provider = getEmailProvider();
    const result = await provider.sendEmail({
      to: email,
      subject: getPaymentRecoveredSubject(),
      text: getPaymentRecoveredText(templateData),
      html: getPaymentRecoveredHtml(templateData),
    });

    if (result.status === 'error') {
      logger.error('Failed to send payment recovered email', {
        userId: info.userId,
        error: result.error,
      });
      return { success: false, error: result.error };
    }

    if (result.status === 'skipped') {
      logger.warn('Payment recovered email skipped', {
        userId: info.userId,
        detail: result.detail,
      });
      return { success: false, error: result.detail };
    }

    logger.info('Sent payment recovered email', {
      userId: info.userId,
      messageId: result.detail,
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    captureError('Error sending payment recovered email', error, {
      userId: info.userId,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if we should send a dunning email based on attempt count
 * Prevents spam by limiting email frequency
 */
export function shouldSendDunningEmail(attemptCount: number): boolean {
  // Send on attempts 1, 2, 3, 4 (first week of retries)
  // After that, Stripe typically cancels the subscription
  return attemptCount <= 4;
}

/**
 * Check if this is a recovery scenario (payment succeeded after failures)
 * Called from payment_succeeded webhook when subscription was previously past_due
 */
export function isRecoveryScenario(previousStatus?: string): boolean {
  const failureStatuses = ['past_due', 'unpaid', 'incomplete'];
  return previousStatus ? failureStatuses.includes(previousStatus) : false;
}
