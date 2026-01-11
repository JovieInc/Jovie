/**
 * Email Job Enqueueing
 *
 * Helper functions to enqueue email jobs.
 */

import type { DbType } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';
import type { SendClaimInvitePayload } from './send-claim-invite';

/**
 * Enqueue a send_claim_invite job for processing.
 *
 * @param tx - Database transaction
 * @param payload - Job payload with inviteId and creatorProfileId
 * @param options - Optional job configuration
 */
export async function enqueueClaimInviteJob(
  tx: DbType,
  payload: SendClaimInvitePayload,
  options: {
    /** When to run the job (defaults to now) */
    runAt?: Date;
    /** Job priority (lower = higher priority, default 0) */
    priority?: number;
    /** Maximum retry attempts (default 3) */
    maxAttempts?: number;
  } = {}
): Promise<string> {
  const { runAt = new Date(), priority = 0, maxAttempts = 3 } = options;

  const dedupKey = `send_claim_invite:${payload.inviteId}`;

  const [job] = await tx
    .insert(ingestionJobs)
    .values({
      jobType: 'send_claim_invite',
      payload,
      status: 'pending',
      runAt,
      priority,
      maxAttempts,
      dedupKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: [ingestionJobs.dedupKey] })
    .returning({ id: ingestionJobs.id });

  if (job) {
    logger.info('Enqueued claim invite job', {
      jobId: job.id,
      inviteId: payload.inviteId,
      creatorProfileId: payload.creatorProfileId,
      runAt,
    });
    return job.id;
  }

  // Job already exists (dedup)
  logger.debug('Claim invite job already exists', {
    dedupKey,
    inviteId: payload.inviteId,
  });
  return dedupKey;
}

/**
 * Enqueue multiple claim invite jobs in a batch.
 *
 * @param tx - Database transaction
 * @param invites - Array of invite payloads
 * @param options - Optional job configuration
 */
export async function enqueueBulkClaimInviteJobs(
  tx: DbType,
  invites: SendClaimInvitePayload[],
  options: {
    /** Delay between emails in ms (for rate limiting) */
    staggerDelayMs?: number;
    /** Base priority (will increment per invite) */
    basePriority?: number;
    /** Maximum retry attempts (default 3) */
    maxAttempts?: number;
  } = {}
): Promise<{ enqueued: number; skipped: number }> {
  const {
    staggerDelayMs = 1000, // 1 second between emails
    basePriority = 10,
    maxAttempts = 3,
  } = options;

  let enqueued = 0;
  let skipped = 0;

  for (let i = 0; i < invites.length; i++) {
    const invite = invites[i];
    const runAt = new Date(Date.now() + i * staggerDelayMs);
    const priority = basePriority + i; // Later invites have lower priority

    const dedupKey = `send_claim_invite:${invite.inviteId}`;

    const [job] = await tx
      .insert(ingestionJobs)
      .values({
        jobType: 'send_claim_invite',
        payload: invite,
        status: 'pending',
        runAt,
        priority,
        maxAttempts,
        dedupKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: [ingestionJobs.dedupKey] })
      .returning({ id: ingestionJobs.id });

    if (job) {
      enqueued++;
    } else {
      skipped++;
    }
  }

  logger.info('Enqueued bulk claim invite jobs', {
    total: invites.length,
    enqueued,
    skipped,
    staggerDelayMs,
  });

  return { enqueued, skipped };
}
