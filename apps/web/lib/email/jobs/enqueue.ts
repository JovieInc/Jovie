/**
 * Email Job Enqueueing
 *
 * Helper functions to enqueue email jobs.
 */

import type { DbOrTransaction } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';
import type { SendClaimInvitePayload } from './send-claim-invite';

/**
 * Generate a random delay between min and max (in ms).
 * Adds human-like variance to avoid spam filter detection.
 */
function randomDelay(minMs: number, maxMs: number): number {
  const range = maxMs - minMs;
  return Math.floor(minMs + Math.random() * range);
}

/**
 * Enqueue a send_claim_invite job for processing.
 *
 * @param tx - Database transaction
 * @param payload - Job payload with inviteId and creatorProfileId
 * @param options - Optional job configuration
 */
export async function enqueueClaimInviteJob(
  tx: DbOrTransaction,
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
 * Enqueue multiple claim invite jobs in a batch with randomized delays.
 *
 * Uses randomized staggering between minDelayMs and maxDelayMs to:
 * - Avoid rate limiting
 * - Appear more human-like to spam filters
 * - Improve deliverability
 *
 * @param tx - Database transaction
 * @param invites - Array of invite payloads
 * @param options - Optional job configuration
 */
export async function enqueueBulkClaimInviteJobs(
  tx: DbOrTransaction,
  invites: SendClaimInvitePayload[],
  options: {
    /** Minimum delay between emails in ms */
    minDelayMs?: number;
    /** Maximum delay between emails in ms */
    maxDelayMs?: number;
    /** @deprecated Use minDelayMs/maxDelayMs instead. Fixed delay between emails (no randomization). */
    staggerDelayMs?: number;
    /** Base priority (will increment per invite) */
    basePriority?: number;
    /** Maximum retry attempts (default 3) */
    maxAttempts?: number;
  } = {}
): Promise<{ enqueued: number; skipped: number }> {
  const {
    minDelayMs,
    maxDelayMs,
    staggerDelayMs,
    basePriority = 10,
    maxAttempts = 3,
  } = options;

  // Support both old fixed delay and new randomized delay
  const useRandomDelay = minDelayMs !== undefined && maxDelayMs !== undefined;
  const fixedDelay = staggerDelayMs ?? 30000; // 30 second default

  // Capture base timestamp once for consistent staggering
  const baseTime = Date.now();

  let enqueued = 0;
  let skipped = 0;
  let cumulativeDelayMs = 0;

  for (let i = 0; i < invites.length; i++) {
    const invite = invites[i];

    // Calculate delay for this invite
    let delayMs: number;
    if (useRandomDelay) {
      // Add random delay to cumulative total
      delayMs = cumulativeDelayMs;
      cumulativeDelayMs += randomDelay(minDelayMs!, maxDelayMs!);
    } else {
      // Use fixed delay
      delayMs = i * fixedDelay;
    }

    const runAt = new Date(baseTime + delayMs);
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
    useRandomDelay,
    minDelayMs: useRandomDelay ? minDelayMs : undefined,
    maxDelayMs: useRandomDelay ? maxDelayMs : undefined,
    fixedDelayMs: useRandomDelay ? undefined : fixedDelay,
    totalSpreadMs: cumulativeDelayMs || (invites.length - 1) * fixedDelay,
  });

  return { enqueued, skipped };
}
