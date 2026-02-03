/**
 * Campaign Processor
 *
 * Processes drip campaign enrollments and sends follow-up emails.
 * Should be called periodically (e.g., every 15 minutes via cron).
 */

import { and, sql as drizzleSql, eq, lte } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type CampaignStep,
  campaignEnrollments,
  campaignSequences,
  emailEngagement,
} from '@/lib/db/schema/email-engagement';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
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
    const reason = await getStopReasonForCondition(enrollment, condition);
    if (reason) {
      return reason;
    }
  }

  return null;
}

async function getStopReasonForCondition(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  condition: NonNullable<CampaignStep['stopConditions']>[number]
): Promise<string | null> {
  const handlers: Record<string, () => Promise<string | null>> = {
    claimed: () => checkProfileClaimed(enrollment.subjectId),
    unsubscribed: () =>
      checkSuppressionReason(enrollment.recipientHash, 'user_request'),
    bounced: () =>
      checkSuppressionReason(
        enrollment.recipientHash,
        'hard_bounce',
        'soft_bounce'
      ),
    opened: () => checkEngagement(enrollment.recipientHash, 'open', 'opened'),
    clicked: () =>
      checkEngagement(enrollment.recipientHash, 'click', 'clicked'),
  };

  const handler = handlers[condition.type];
  return handler ? handler() : null;
}

async function checkProfileClaimed(subjectId: string): Promise<string | null> {
  const [profile] = await db
    .select({ isClaimed: creatorProfiles.isClaimed })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, subjectId))
    .limit(1);

  return profile?.isClaimed ? 'claimed' : null;
}

async function checkSuppressionReason(
  recipientHash: string,
  ...reasons: ('user_request' | 'hard_bounce' | 'soft_bounce')[]
): Promise<string | null> {
  const [suppression] = await db.query.emailSuppressions.findMany({
    where: (table, { eq: eqOp, and: andOp, or: orOp }) =>
      andOp(
        eqOp(table.emailHash, recipientHash),
        reasons.length === 1
          ? eqOp(table.reason, reasons[0])
          : orOp(...reasons.map(reason => eqOp(table.reason, reason)))
      ),
    limit: 1,
  });

  if (!suppression) {
    return null;
  }

  if (reasons.includes('user_request')) {
    return 'unsubscribed';
  }

  if (reasons.includes('hard_bounce') || reasons.includes('soft_bounce')) {
    return 'bounced';
  }

  return null;
}

async function checkEngagement(
  recipientHash: string,
  eventType: 'open' | 'click',
  reason: 'opened' | 'clicked'
): Promise<string | null> {
  const [engagement] = await db
    .select({ id: emailEngagement.id })
    .from(emailEngagement)
    .where(
      and(
        eq(emailEngagement.recipientHash, recipientHash),
        eq(emailEngagement.eventType, eventType)
      )
    )
    .limit(1);

  return engagement ? reason : null;
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
    .orderBy(drizzleSql`${creatorClaimInvites.sentAt} DESC`)
    .limit(1);

  if (!invite?.claimToken) {
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
    const pendingEnrollments = await fetchPendingEnrollments(now);
    if (pendingEnrollments.length === 0) {
      return result;
    }

    const sequenceMap = await loadSequenceMap();

    for (const enrollment of pendingEnrollments) {
      result.processed++;
      await processEnrollment(enrollment, sequenceMap, now, result);
    }

    return result;
  } catch (error) {
    logger.error('[Campaign Processor] Failed to process campaigns', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

type EnrollmentRow = Awaited<
  ReturnType<typeof fetchPendingEnrollments>
>[number];
type SequenceRow = typeof campaignSequences.$inferSelect;

async function fetchPendingEnrollments(now: Date) {
  return db
    .select({
      id: campaignEnrollments.id,
      campaignSequenceId: campaignEnrollments.campaignSequenceId,
      subjectId: campaignEnrollments.subjectId,
      recipientHash: campaignEnrollments.recipientHash,
      currentStep: campaignEnrollments.currentStep,
      stepCompletedAt: campaignEnrollments.stepCompletedAt,
      nextStepAt: campaignEnrollments.nextStepAt,
    })
    .from(campaignEnrollments)
    .where(
      and(
        eq(campaignEnrollments.status, 'active'),
        lte(campaignEnrollments.nextStepAt, now)
      )
    )
    .limit(50);
}

async function loadSequenceMap() {
  const sequences = await db.query.campaignSequences.findMany();
  return new Map(sequences.map(sequence => [sequence.id, sequence]));
}

async function processEnrollment(
  enrollment: EnrollmentRow,
  sequenceMap: Map<string, SequenceRow>,
  now: Date,
  result: ProcessCampaignsResult
) {
  try {
    const sequence = sequenceMap.get(enrollment.campaignSequenceId);
    if (sequence?.isActive !== 'true') {
      await stopEnrollment(enrollment.id, 'campaign_inactive', now);
      result.stopped++;
      return;
    }

    const { steps, nextStep, nextStepNumber } = getNextStep(
      sequence,
      enrollment
    );
    if (!nextStep) {
      await completeEnrollment(enrollment.id, now);
      result.completed++;
      return;
    }

    const stopReason = await checkStopConditions(
      enrollment,
      nextStep.stopConditions
    );
    if (stopReason) {
      await stopEnrollment(enrollment.id, stopReason, now);
      result.stopped++;
      return;
    }

    const skipped = await maybeSkipStep(
      enrollment,
      nextStep,
      steps,
      now,
      nextStepNumber
    );
    if (skipped) {
      result.skipped++;
      return;
    }

    const inviteData = await getClaimInviteData(enrollment.subjectId);
    if (!inviteData) {
      logger.warn('[Campaign Processor] No invite data found', {
        enrollmentId: enrollment.id,
        subjectId: enrollment.subjectId,
      });
      result.errors++;
      return;
    }

    const suppressionCheck = await isEmailSuppressed(inviteData.invite.email);
    if (suppressionCheck.suppressed) {
      await stopEnrollment(
        enrollment.id,
        `suppressed:${suppressionCheck.reason}`,
        now
      );
      result.stopped++;
      return;
    }

    await sendFollowUp(inviteData, enrollment.subjectId);
    await advanceEnrollment(enrollment, steps, now, nextStepNumber);
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

function getNextStep(sequence: SequenceRow, enrollment: EnrollmentRow) {
  const steps = sequence.steps as CampaignStep[];
  const currentStepNumber = Number(enrollment.currentStep);
  const nextStepNumber = currentStepNumber + 1;
  const nextStep = steps.find(step => step.stepNumber === nextStepNumber);
  return { steps, nextStep, nextStepNumber };
}

async function maybeSkipStep(
  enrollment: EnrollmentRow,
  nextStep: CampaignStep,
  steps: CampaignStep[],
  now: Date,
  nextStepNumber: number
) {
  const shouldSkip = await checkSkipConditions(
    enrollment,
    nextStep.skipConditions
  );

  if (!shouldSkip) {
    return false;
  }

  await advanceEnrollment(enrollment, steps, now, nextStepNumber);
  return true;
}

async function stopEnrollment(
  enrollmentId: string,
  stopReason: string,
  now: Date
) {
  await db
    .update(campaignEnrollments)
    .set({
      status: 'stopped',
      stopReason,
      updatedAt: now,
    })
    .where(eq(campaignEnrollments.id, enrollmentId));
}

async function completeEnrollment(enrollmentId: string, now: Date) {
  await db
    .update(campaignEnrollments)
    .set({
      status: 'completed',
      updatedAt: now,
    })
    .where(eq(campaignEnrollments.id, enrollmentId));
}

async function advanceEnrollment(
  enrollment: EnrollmentRow,
  steps: CampaignStep[],
  now: Date,
  nextStepNumber: number
) {
  const nextNextStep = steps.find(
    step => step.stepNumber === nextStepNumber + 1
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
}

async function sendFollowUp(
  inviteData: NonNullable<Awaited<ReturnType<typeof getClaimInviteData>>>,
  subjectId: string
) {
  await enqueueBulkClaimInviteJobs(
    db,
    [
      {
        inviteId: inviteData.invite.id,
        creatorProfileId: subjectId,
      },
    ],
    {
      minDelayMs: 0,
      maxDelayMs: 60000,
    }
  );
}
