/**
 * Campaign Processor
 *
 * Processes drip campaign enrollments and sends follow-up emails.
 * Should be called periodically (e.g., every 15 minutes via cron).
 */

import { and, sql as drizzleSql, eq, inArray, isNull, lte, or, gt } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type CampaignStep,
  campaignEnrollments,
  campaignSequences,
  emailEngagement,
} from '@/lib/db/schema/email-engagement';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import { enqueueBulkClaimInviteJobs } from '@/lib/email/jobs/enqueue';
import { hashEmail } from '@/lib/notifications/suppression';
import type { SuppressionReason } from '@/lib/notifications/suppression';
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
 * Claim invite data needed for sending follow-up emails
 */
interface ClaimInviteData {
  invite: { id: string; email: string };
  profile: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    claimToken: string;
  };
}

/**
 * Pre-fetched data for batch processing enrollments.
 * Eliminates N+1 queries by fetching all data upfront.
 */
interface BatchedLookups {
  /** Set of subjectIds where the profile has been claimed */
  claimedProfiles: Set<string>;
  /** Map of recipientHash → suppression reasons (e.g., user_request, hard_bounce) */
  suppressions: Map<string, { reason: string }>;
  /** Map of recipientHash → set of engagement event types (open, click) */
  engagements: Map<string, Set<string>>;
  /** Map of subjectId → claim invite data for sending emails */
  claimInvites: Map<string, ClaimInviteData>;
  /** Map of emailHash → active suppression info for final email-level check */
  emailSuppressionsByHash: Map<string, { reason: SuppressionReason }>;
}

/**
 * Check if a stop condition is met for an enrollment using pre-fetched data
 */
function checkStopConditions(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  conditions: CampaignStep['stopConditions'],
  lookups: BatchedLookups
): string | null {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  for (const condition of conditions) {
    const reason = getStopReasonForCondition(enrollment, condition, lookups);
    if (reason) {
      return reason;
    }
  }

  return null;
}

function getStopReasonForCondition(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  condition: NonNullable<CampaignStep['stopConditions']>[number],
  lookups: BatchedLookups
): string | null {
  switch (condition.type) {
    case 'claimed':
      return lookups.claimedProfiles.has(enrollment.subjectId)
        ? 'claimed'
        : null;

    case 'unsubscribed': {
      const suppression = lookups.suppressions.get(enrollment.recipientHash);
      return suppression?.reason === 'user_request' ? 'unsubscribed' : null;
    }

    case 'bounced': {
      const suppression = lookups.suppressions.get(enrollment.recipientHash);
      if (!suppression) return null;
      return suppression.reason === 'hard_bounce' ||
        suppression.reason === 'soft_bounce'
        ? 'bounced'
        : null;
    }

    case 'opened': {
      const events = lookups.engagements.get(enrollment.recipientHash);
      return events?.has('open') ? 'opened' : null;
    }

    case 'clicked': {
      const events = lookups.engagements.get(enrollment.recipientHash);
      return events?.has('click') ? 'clicked' : null;
    }

    default:
      return null;
  }
}

/**
 * Check if skip conditions are met for a step using pre-fetched data
 */
function checkSkipConditions(
  enrollment: {
    subjectId: string;
    recipientHash: string;
  },
  conditions: CampaignStep['skipConditions'],
  lookups: BatchedLookups
): boolean {
  if (!conditions || conditions.length === 0) {
    return false;
  }

  const events = lookups.engagements.get(enrollment.recipientHash);

  for (const condition of conditions) {
    switch (condition.type) {
      case 'opened': {
        if (events?.has('open')) {
          return true;
        }
        break;
      }
      case 'clicked': {
        if (events?.has('click')) {
          return true;
        }
        break;
      }
    }
  }

  return false;
}

// --- Batch fetch helpers ---

/**
 * Batch fetch claim status for all subject IDs.
 * Returns a Set of subjectIds where the profile has been claimed.
 */
async function batchFetchClaimStatus(
  subjectIds: string[]
): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();

  const rows = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        inArray(creatorProfiles.id, subjectIds),
        eq(creatorProfiles.isClaimed, true)
      )
    );

  return new Set(rows.map(row => row.id));
}

/**
 * Batch fetch suppressions for all recipient hashes.
 * Returns a Map of recipientHash → { reason }.
 * Uses the first (most relevant) suppression per recipient.
 */
async function batchFetchSuppressions(
  recipientHashes: string[]
): Promise<Map<string, { reason: string }>> {
  if (recipientHashes.length === 0) return new Map();

  const rows = await db.query.emailSuppressions.findMany({
    where: (table, { inArray: inArrayOp }) =>
      inArrayOp(table.emailHash, recipientHashes),
  });

  const result = new Map<string, { reason: string }>();
  for (const row of rows) {
    // Keep the first suppression found per hash (or overwrite with higher-priority reasons)
    if (!result.has(row.emailHash)) {
      result.set(row.emailHash, { reason: row.reason });
    }
  }
  return result;
}

/**
 * Batch fetch engagement events for all recipient hashes.
 * Returns a Map of recipientHash → Set of event types (e.g., 'open', 'click').
 */
async function batchFetchEngagements(
  recipientHashes: string[]
): Promise<Map<string, Set<string>>> {
  if (recipientHashes.length === 0) return new Map();

  const rows = await db
    .select({
      recipientHash: emailEngagement.recipientHash,
      eventType: emailEngagement.eventType,
    })
    .from(emailEngagement)
    .where(inArray(emailEngagement.recipientHash, recipientHashes));

  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    let events = result.get(row.recipientHash);
    if (!events) {
      events = new Set();
      result.set(row.recipientHash, events);
    }
    events.add(row.eventType);
  }
  return result;
}

/**
 * Batch fetch claim invite data for all subject IDs.
 * Returns a Map of subjectId → ClaimInviteData (most recent sent invite per subject).
 */
async function batchFetchClaimInvites(
  subjectIds: string[]
): Promise<Map<string, ClaimInviteData>> {
  if (subjectIds.length === 0) return new Map();

  const rows = await db
    .select({
      inviteId: creatorClaimInvites.id,
      email: creatorClaimInvites.email,
      creatorProfileId: creatorClaimInvites.creatorProfileId,
      sentAt: creatorClaimInvites.sentAt,
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
        inArray(creatorClaimInvites.creatorProfileId, subjectIds),
        eq(creatorClaimInvites.status, 'sent')
      )
    )
    .orderBy(drizzleSql`${creatorClaimInvites.sentAt} DESC`);

  const result = new Map<string, ClaimInviteData>();
  for (const row of rows) {
    // Keep only the most recent invite per subject (rows are ordered DESC by sentAt)
    if (result.has(row.creatorProfileId)) continue;
    if (!row.claimToken) continue;

    result.set(row.creatorProfileId, {
      invite: { id: row.inviteId, email: row.email },
      profile: {
        id: row.profileId,
        username: row.username,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        claimToken: row.claimToken,
      },
    });
  }
  return result;
}

/**
 * Batch fetch email-level suppressions using email hashes derived from invite emails.
 * This replaces the per-enrollment isEmailSuppressed() call.
 * Returns a Map of emailHash → { reason }.
 */
async function batchFetchEmailSuppressions(
  emailHashes: string[]
): Promise<Map<string, { reason: SuppressionReason }>> {
  if (emailHashes.length === 0) return new Map();

  const now = new Date();
  const rows = await db
    .select({
      emailHash: emailSuppressions.emailHash,
      reason: emailSuppressions.reason,
    })
    .from(emailSuppressions)
    .where(
      and(
        inArray(emailSuppressions.emailHash, emailHashes),
        or(
          isNull(emailSuppressions.expiresAt),
          gt(emailSuppressions.expiresAt, now)
        )
      )
    );

  const result = new Map<string, { reason: SuppressionReason }>();
  for (const row of rows) {
    if (!result.has(row.emailHash)) {
      result.set(row.emailHash, { reason: row.reason });
    }
  }
  return result;
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

    const subjectIds = pendingEnrollments.map(e => e.subjectId);
    const recipientHashes = pendingEnrollments.map(e => e.recipientHash);

    // Batch fetch all data in parallel (replaces N+1 per-enrollment queries)
    const [
      sequenceMap,
      claimedProfiles,
      suppressions,
      engagements,
      claimInvites,
    ] = await Promise.all([
      loadSequenceMap(),
      batchFetchClaimStatus(subjectIds),
      batchFetchSuppressions(recipientHashes),
      batchFetchEngagements(recipientHashes),
      batchFetchClaimInvites(subjectIds),
    ]);

    // Build email hashes from the invite emails for suppression checking
    const emailHashMap = new Map<string, string>(); // subjectId → emailHash
    const emailHashes: string[] = [];
    for (const [subjectId, inviteData] of claimInvites) {
      const hash = hashEmail(inviteData.invite.email);
      emailHashMap.set(subjectId, hash);
      emailHashes.push(hash);
    }

    const emailSuppressionsByHash =
      await batchFetchEmailSuppressions(emailHashes);

    const lookups: BatchedLookups = {
      claimedProfiles,
      suppressions,
      engagements,
      claimInvites,
      emailSuppressionsByHash,
    };

    for (const enrollment of pendingEnrollments) {
      result.processed++;
      await processEnrollment(
        enrollment,
        sequenceMap,
        now,
        result,
        lookups,
        emailHashMap
      );
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
  const sequences = await db.query.campaignSequences.findMany({
    where: (table, { eq: eqOp }) => eqOp(table.isActive, 'true'),
  });
  return new Map(sequences.map(sequence => [sequence.id, sequence]));
}

async function processEnrollment(
  enrollment: EnrollmentRow,
  sequenceMap: Map<string, SequenceRow>,
  now: Date,
  result: ProcessCampaignsResult,
  lookups: BatchedLookups,
  emailHashMap: Map<string, string>
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

    const stopReason = checkStopConditions(
      enrollment,
      nextStep.stopConditions,
      lookups
    );
    if (stopReason) {
      await stopEnrollment(enrollment.id, stopReason, now);
      result.stopped++;
      return;
    }

    const skipped = shouldSkipStep(enrollment, nextStep, lookups);
    if (skipped) {
      await advanceEnrollment(enrollment, steps, now, nextStepNumber);
      result.skipped++;
      return;
    }

    const inviteData = lookups.claimInvites.get(enrollment.subjectId);
    if (!inviteData) {
      logger.warn('[Campaign Processor] No invite data found', {
        enrollmentId: enrollment.id,
        subjectId: enrollment.subjectId,
      });
      result.errors++;
      return;
    }

    // Check email-level suppression using pre-fetched data
    const emailHash = emailHashMap.get(enrollment.subjectId);
    if (emailHash) {
      const suppression = lookups.emailSuppressionsByHash.get(emailHash);
      if (suppression) {
        await stopEnrollment(
          enrollment.id,
          `suppressed:${suppression.reason}`,
          now
        );
        result.stopped++;
        return;
      }
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

function shouldSkipStep(
  enrollment: EnrollmentRow,
  nextStep: CampaignStep,
  lookups: BatchedLookups
) {
  return checkSkipConditions(enrollment, nextStep.skipConditions, lookups);
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
  inviteData: ClaimInviteData,
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
