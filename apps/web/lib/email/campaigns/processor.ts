/**
 * Campaign Processor
 *
 * Processes drip campaign enrollments and sends follow-up emails.
 * Should be called periodically (e.g., every 15 minutes via cron).
 */

import { and, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type CampaignStep,
  campaignEnrollments,
  creatorClaimInvites,
  creatorProfiles,
  emailEngagement,
} from '@/lib/db/schema';
import { enqueueBulkClaimInviteJobs } from '@/lib/email/jobs/enqueue';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

/**
 * Result of processing enrollments
 */
export interface ProcessCampaignsResult {
  processed: number;
  sent: number;
  skipped: number;
  stopped: number;
  completed: number;
  errors: number;
}

/**
 * Check if a stop condition is met for an enrollment
 */
async function checkStopConditions(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  conditions: CampaignStep['stopConditions']
): Promise<string | null> {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'claimed': {
        // Check if the profile has been claimed
        const [profile] = await db
          .select({ isClaimed: creatorProfiles.isClaimed })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, enrollment.subjectId))
          .limit(1);

        if (profile?.isClaimed) {
          return 'claimed';
        }
        break;
      }

      case 'unsubscribed': {
        // Check if the email is suppressed with user_request
        const [suppression] = await db.query.emailSuppressions.findMany({
          where: (table, { eq: eqOp, and: andOp }) =>
            andOp(
              eqOp(table.emailHash, enrollment.recipientHash),
              eqOp(table.reason, 'user_request')
            ),
          limit: 1,
        });

        if (suppression) {
          return 'unsubscribed';
        }
        break;
      }

      case 'bounced': {
        // Check if the email has bounced
        const [suppression] = await db.query.emailSuppressions.findMany({
          where: (table, { eq: eqOp, and: andOp, or: orOp }) =>
            andOp(
              eqOp(table.emailHash, enrollment.recipientHash),
              orOp(
                eqOp(table.reason, 'hard_bounce'),
                eqOp(table.reason, 'soft_bounce')
              )
            ),
          limit: 1,
        });

        if (suppression) {
          return 'bounced';
        }
        break;
      }

      case 'opened':
      case 'clicked': {
        // Check engagement
        const [engagement] = await db
          .select({ id: emailEngagement.id })
          .from(emailEngagement)
          .where(
            and(
              eq(emailEngagement.recipientHash, enrollment.recipientHash),
              eq(
                emailEngagement.eventType,
                condition.type === 'opened' ? 'open' : 'click'
              )
            )
          )
          .limit(1);

        if (engagement) {
          return condition.type;
        }
        break;
      }
    }
  }

  return null;
}

/**
 * Check if skip conditions are met for a step
 */
async function checkSkipConditions(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  conditions: CampaignStep['skipConditions']
): Promise<boolean> {
  if (!conditions || conditions.length === 0) {
    return false;
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'opened':
      case 'clicked': {
        const [engagement] = await db
          .select({ id: emailEngagement.id })
          .from(emailEngagement)
          .where(
            and(
              eq(emailEngagement.recipientHash, enrollment.recipientHash),
              eq(
                emailEngagement.eventType,
                condition.type === 'opened' ? 'open' : 'click'
              )
            )
          )
          .limit(1);

        if (engagement) {
          return true;
        }
        break;
      }
    }
  }

  return false;
}

/**
 * Get the claim invite data for sending a follow-up
 */
async function getClaimInviteData(subjectId: string): Promise<{
  invite: { id: string; email: string };
  profile: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    claimToken: string;
  };
} | null> {
  const [invite] = await db
    .select({
      inviteId: creatorClaimInvites.id,
      email: creatorClaimInvites.email,
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      claimToken: creatorProfiles.claimToken,
    })
    .from(creatorClaimInvites)
    .innerJoin(
      creatorProfiles,
      eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorClaimInvites.creatorProfileId, subjectId),
        eq(creatorClaimInvites.status, 'sent')
      )
    )
    .orderBy(sql`${creatorClaimInvites.sentAt} DESC`)
    .limit(1);

  if (!invite || !invite.claimToken) {
    return null;
  }

  return {
    invite: { id: invite.inviteId, email: invite.email },
    profile: {
      id: invite.profileId,
      username: invite.username,
      displayName: invite.displayName,
      avatarUrl: invite.avatarUrl,
      claimToken: invite.claimToken,
    },
  };
}

/**
 * Process all pending campaign enrollments
 */
export async function processCampaigns(): Promise<ProcessCampaignsResult> {
  const result: ProcessCampaignsResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    stopped: 0,
    completed: 0,
    errors: 0,
  };

  const now = new Date();

  try {
    // Find enrollments that need processing
    const pendingEnrollments = await db
      .select({
        id: campaignEnrollments.id,
        campaignSequenceId: campaignEnrollments.campaignSequenceId,
        subjectId: campaignEnrollments.subjectId,
        recipientHash: campaignEnrollments.recipientHash,
        currentStep: campaignEnrollments.currentStep,
        stepCompletedAt: campaignEnrollments.stepCompletedAt,
      })
      .from(campaignEnrollments)
      .where(
        and(
          eq(campaignEnrollments.status, 'active'),
          lte(campaignEnrollments.nextStepAt, now)
        )
      )
      .limit(50); // Process in batches

    if (pendingEnrollments.length === 0) {
      return result;
    }

    // Get all campaign sequences
    const sequences = await db.query.campaignSequences.findMany();
    const sequenceMap = new Map(sequences.map(s => [s.id, s]));

    for (const enrollment of pendingEnrollments) {
      result.processed++;

      try {
        const sequence = sequenceMap.get(enrollment.campaignSequenceId);
        if (!sequence || sequence.isActive !== 'true') {
          // Campaign not found or inactive - stop enrollment
          await db
            .update(campaignEnrollments)
            .set({
              status: 'stopped',
              stopReason: 'campaign_inactive',
              updatedAt: now,
            })
            .where(eq(campaignEnrollments.id, enrollment.id));
          result.stopped++;
          continue;
        }

        const steps = sequence.steps as CampaignStep[];
        const currentStepNumber = Number(enrollment.currentStep);
        const nextStepNumber = currentStepNumber + 1;
        const nextStep = steps.find(s => s.stepNumber === nextStepNumber);

        if (!nextStep) {
          // No more steps - mark as completed
          await db
            .update(campaignEnrollments)
            .set({
              status: 'completed',
              updatedAt: now,
            })
            .where(eq(campaignEnrollments.id, enrollment.id));
          result.completed++;
          continue;
        }

        // Check stop conditions
        const stopReason = await checkStopConditions(
          enrollment,
          nextStep.stopConditions
        );
        if (stopReason) {
          await db
            .update(campaignEnrollments)
            .set({
              status: 'stopped',
              stopReason,
              updatedAt: now,
            })
            .where(eq(campaignEnrollments.id, enrollment.id));
          result.stopped++;
          continue;
        }

        // Check skip conditions
        const shouldSkip = await checkSkipConditions(
          enrollment,
          nextStep.skipConditions
        );
        if (shouldSkip) {
          // Skip this step but schedule next one
          const nextNextStep = steps.find(
            s => s.stepNumber === nextStepNumber + 1
          );
          const nextStepAt = nextNextStep
            ? new Date(now.getTime() + nextNextStep.delayHours * 60 * 60 * 1000)
            : null;

          const stepCompletedAt = {
            ...(enrollment.stepCompletedAt as Record<string, string>),
            [nextStepNumber]: now.toISOString(),
          };

          await db
            .update(campaignEnrollments)
            .set({
              currentStep: String(nextStepNumber),
              stepCompletedAt,
              nextStepAt,
              status: nextStepAt ? 'active' : 'completed',
              updatedAt: now,
            })
            .where(eq(campaignEnrollments.id, enrollment.id));

          result.skipped++;
          continue;
        }

        // Get invite data for sending
        const inviteData = await getClaimInviteData(enrollment.subjectId);
        if (!inviteData) {
          logger.warn('[Campaign Processor] No invite data found', {
            enrollmentId: enrollment.id,
            subjectId: enrollment.subjectId,
          });
          result.errors++;
          continue;
        }

        // Check if email is suppressed
        const suppressionCheck = await isEmailSuppressed(
          inviteData.invite.email
        );
        if (suppressionCheck.suppressed) {
          await db
            .update(campaignEnrollments)
            .set({
              status: 'stopped',
              stopReason: `suppressed:${suppressionCheck.reason}`,
              updatedAt: now,
            })
            .where(eq(campaignEnrollments.id, enrollment.id));
          result.stopped++;
          continue;
        }

        // Enqueue the follow-up email job
        // We'll use a custom job type for follow-ups
        await enqueueBulkClaimInviteJobs(
          db,
          [
            {
              inviteId: inviteData.invite.id,
              creatorProfileId: enrollment.subjectId,
            },
          ],
          {
            minDelayMs: 0,
            maxDelayMs: 60000, // Send within 1 minute
          }
        );

        // Update enrollment
        const nextNextStep = steps.find(
          s => s.stepNumber === nextStepNumber + 1
        );
        const nextStepAt = nextNextStep
          ? new Date(now.getTime() + nextNextStep.delayHours * 60 * 60 * 1000)
          : null;

        const stepCompletedAt = {
          ...(enrollment.stepCompletedAt as Record<string, string>),
          [nextStepNumber]: now.toISOString(),
        };

        await db
          .update(campaignEnrollments)
          .set({
            currentStep: String(nextStepNumber),
            stepCompletedAt,
            nextStepAt,
            status: nextStepAt ? 'active' : 'completed',
            updatedAt: now,
          })
          .where(eq(campaignEnrollments.id, enrollment.id));

        result.sent++;

        logger.info('[Campaign Processor] Sent follow-up', {
          enrollmentId: enrollment.id,
          step: nextStepNumber,
          email: inviteData.invite.email.slice(0, 3) + '***',
        });
      } catch (error) {
        logger.error('[Campaign Processor] Failed to process enrollment', {
          enrollmentId: enrollment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        result.errors++;
      }
    }

    return result;
  } catch (error) {
    logger.error('[Campaign Processor] Failed to process campaigns', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
