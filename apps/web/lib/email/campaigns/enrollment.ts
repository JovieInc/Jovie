/**
 * Campaign Enrollment Management
 *
 * Functions for managing campaign enrollments (drip sequences).
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { campaignEnrollments } from '@/lib/db/schema';
import { hashEmail } from '@/lib/email/tracking';
import { logger } from '@/lib/utils/logger';

/**
 * Stop enrollment status type
 */
export type EnrollmentStopReason =
  | 'bounced'
  | 'unsubscribed'
  | 'complained'
  | 'claimed'
  | 'completed'
  | 'manual';

/**
 * Stop all active campaign enrollments for an email address.
 * Called when an email bounces, unsubscribes, or complains.
 *
 * @param email - The email address
 * @param reason - Why the enrollment is being stopped
 * @returns Number of enrollments stopped
 */
export async function stopEnrollmentsForEmail(
  email: string,
  reason: EnrollmentStopReason
): Promise<number> {
  const recipientHash = hashEmail(email);

  try {
    const result = await db
      .update(campaignEnrollments)
      .set({
        status: reason === 'completed' ? 'completed' : 'stopped',
        stopReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignEnrollments.recipientHash, recipientHash),
          eq(campaignEnrollments.status, 'active')
        )
      )
      .returning({ id: campaignEnrollments.id });

    if (result.length > 0) {
      logger.info('[Campaign Enrollment] Stopped enrollments', {
        count: result.length,
        reason,
        recipientHashPrefix: recipientHash.slice(0, 8),
      });
    }

    return result.length;
  } catch (error) {
    logger.error('[Campaign Enrollment] Failed to stop enrollments', {
      error: error instanceof Error ? error.message : 'Unknown error',
      reason,
    });
    return 0;
  }
}

/**
 * Stop all active campaign enrollments for a subject (e.g., when profile is claimed).
 *
 * @param subjectId - The subject ID (e.g., creator profile ID)
 * @param reason - Why the enrollment is being stopped
 * @returns Number of enrollments stopped
 */
export async function stopEnrollmentsForSubject(
  subjectId: string,
  reason: EnrollmentStopReason
): Promise<number> {
  try {
    const result = await db
      .update(campaignEnrollments)
      .set({
        status: reason === 'completed' ? 'completed' : 'stopped',
        stopReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignEnrollments.subjectId, subjectId),
          eq(campaignEnrollments.status, 'active')
        )
      )
      .returning({ id: campaignEnrollments.id });

    if (result.length > 0) {
      logger.info('[Campaign Enrollment] Stopped enrollments for subject', {
        subjectId,
        count: result.length,
        reason,
      });
    }

    return result.length;
  } catch (error) {
    logger.error(
      '[Campaign Enrollment] Failed to stop enrollments for subject',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        subjectId,
        reason,
      }
    );
    return 0;
  }
}

/**
 * Enroll a recipient in a campaign.
 *
 * @param params - Enrollment parameters
 * @returns The enrollment ID if created, null if already enrolled
 */
export async function enrollInCampaign(params: {
  campaignKey: string;
  subjectId: string;
  recipientEmail: string;
  delayHours?: number;
}): Promise<string | null> {
  const { campaignKey, subjectId, recipientEmail, delayHours = 0 } = params;
  const recipientHash = hashEmail(recipientEmail);

  try {
    // Look up the campaign sequence
    const [campaign] = await db.query.campaignSequences.findMany({
      where: (table, { eq, and: andOp }) =>
        andOp(eq(table.campaignKey, campaignKey), eq(table.isActive, 'true')),
      limit: 1,
    });

    if (!campaign) {
      logger.warn('[Campaign Enrollment] Campaign not found or inactive', {
        campaignKey,
      });
      return null;
    }

    // Calculate when the first step should be processed
    const nextStepAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

    const [result] = await db
      .insert(campaignEnrollments)
      .values({
        campaignSequenceId: campaign.id,
        subjectId,
        recipientHash,
        currentStep: '0',
        status: 'active',
        nextStepAt,
      })
      .onConflictDoNothing()
      .returning({ id: campaignEnrollments.id });

    if (!result) {
      // Already enrolled
      return null;
    }

    logger.info('[Campaign Enrollment] Enrolled in campaign', {
      campaignKey,
      subjectId,
      enrollmentId: result.id,
      nextStepAt: nextStepAt.toISOString(),
    });

    return result.id;
  } catch (error) {
    logger.error('[Campaign Enrollment] Failed to enroll', {
      error: error instanceof Error ? error.message : 'Unknown error',
      campaignKey,
      subjectId,
    });
    return null;
  }
}
