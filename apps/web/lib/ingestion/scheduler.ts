import { and, sql as drizzleSql, eq, gte, inArray, lte } from 'drizzle-orm';
import { type DbType, ingestionJobs } from '@/lib/db';
import { sendClaimInvitePayloadSchema } from '@/lib/email/jobs/send-claim-invite';
import { logger } from '@/lib/utils/logger';
import {
  beaconsPayloadSchema,
  layloPayloadSchema,
  linktreePayloadSchema,
  youtubePayloadSchema,
} from './jobs/schemas';
import type { JobFailureReason } from './jobs/types';
import { IngestionStatusManager } from './status-manager';
import { ExtractionError } from './strategies/base';

// Retry configuration
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 5000; // 5 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes
const RATE_LIMIT_BASE_BACKOFF_MS = 30000; // 30 seconds
const RATE_LIMIT_MAX_BACKOFF_MS = 900000; // 15 minutes

const MAX_CONCURRENT_JOBS_PER_HOST = 2;
const CLAIM_CANDIDATE_MULTIPLIER = 3;
const STUCK_PROCESSING_AFTER_MS = 20 * 60 * 1000;

/**
 * Calculate exponential backoff delay with jitter.
 */
export function calculateBackoff(
  attempt: number,
  reason: JobFailureReason = 'transient'
): number {
  const base =
    reason === 'rate_limited' ? RATE_LIMIT_BASE_BACKOFF_MS : BASE_BACKOFF_MS;
  const cap =
    reason === 'rate_limited' ? RATE_LIMIT_MAX_BACKOFF_MS : MAX_BACKOFF_MS;
  const exponentialDelay = base * Math.pow(2, attempt - 1);
  const jitterRange = reason === 'rate_limited' ? 5000 : 1000;
  const jitter = Math.random() * jitterRange;
  return Math.min(exponentialDelay + jitter, cap);
}

/**
 * Determine the failure reason from an error.
 */
export function determineJobFailure(error: unknown): {
  message: string;
  reason: JobFailureReason;
} {
  if (error instanceof ExtractionError && error.code === 'RATE_LIMITED') {
    return { message: error.message, reason: 'rate_limited' };
  }

  const message =
    error instanceof Error ? error.message : 'Unknown ingestion error';
  return { message, reason: 'transient' };
}

/**
 * Extract hostname from a job's payload URL.
 */
function getJobHost(job: typeof ingestionJobs.$inferSelect): string | null {
  const payloadUrl =
    typeof job.payload === 'object' && job.payload !== null
      ? (job.payload as Record<string, unknown>).sourceUrl
      : null;

  if (typeof payloadUrl !== 'string') return null;

  try {
    return new URL(payloadUrl).hostname.toLowerCase();
  } catch (error) {
    logger.debug('Failed to parse job host', {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
      payloadUrl,
    });
    return null;
  }
}

/**
 * Get count of currently processing jobs per host.
 */
async function getProcessingHostCounts(
  tx: DbType
): Promise<Map<string, number>> {
  const processingJobs = await tx
    .select({ payload: ingestionJobs.payload })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.status, 'processing'));

  return processingJobs.reduce((map, job) => {
    const host =
      typeof job.payload === 'object' && job.payload !== null
        ? getJobHost(job as typeof ingestionJobs.$inferSelect)
        : null;

    if (!host) return map;
    map.set(host, (map.get(host) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}

/**
 * Extract creator profile ID from a job based on its type.
 */
export function getCreatorProfileIdFromJob(
  job: typeof ingestionJobs.$inferSelect
): string | null {
  switch (job.jobType) {
    case 'import_linktree': {
      const parsed = linktreePayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    case 'import_laylo': {
      const parsed = layloPayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    case 'import_youtube': {
      const parsed = youtubePayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    case 'import_beacons': {
      const parsed = beaconsPayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    case 'send_claim_invite': {
      const parsed = sendClaimInvitePayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    default:
      return null;
  }
}

/**
 * Handle job failure with retry logic.
 */
export async function handleIngestionJobFailure(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect,
  error: unknown
): Promise<void> {
  const { message, reason } = determineJobFailure(error);
  const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const shouldRetry = job.attempts < maxAttempts;

  const creatorProfileId = getCreatorProfileIdFromJob(job);
  if (creatorProfileId) {
    await IngestionStatusManager.handleJobFailure(
      tx,
      creatorProfileId,
      shouldRetry,
      message
    );
  }

  await failJob(tx, job, message, { reason });
}

/**
 * Claim pending jobs for processing.
 * Respects maxAttempts and only claims jobs that are ready to run.
 */
export async function claimPendingJobs(
  tx: DbType,
  now: Date,
  limit = 5
): Promise<(typeof ingestionJobs.$inferSelect)[]> {
  const stuckBefore = new Date(now.getTime() - STUCK_PROCESSING_AFTER_MS);
  const stuckJobs = await tx
    .select({ jobType: ingestionJobs.jobType, payload: ingestionJobs.payload })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.status, 'processing'),
        lte(ingestionJobs.updatedAt, stuckBefore)
      )
    )
    .limit(50);

  await tx
    .update(ingestionJobs)
    .set({
      status: 'pending',
      error: 'Processing timeout; requeued',
      runAt: now,
      nextRunAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ingestionJobs.status, 'processing'),
        lte(ingestionJobs.updatedAt, stuckBefore)
      )
    );

  const stuckProfileIds = stuckJobs
    .map(stuckJob =>
      getCreatorProfileIdFromJob({
        jobType: stuckJob.jobType,
        payload: stuckJob.payload,
      } as typeof ingestionJobs.$inferSelect)
    )
    .filter((id): id is string => id !== null);

  await IngestionStatusManager.handleStuckJobs(
    tx,
    stuckProfileIds,
    stuckBefore,
    'Processing timeout; requeued'
  );

  const exhaustedJobs = await tx
    .select({
      id: ingestionJobs.id,
      maxAttempts: ingestionJobs.maxAttempts,
    })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.status, 'pending'),
        lte(ingestionJobs.runAt, now),
        gte(ingestionJobs.attempts, ingestionJobs.maxAttempts)
      )
    )
    .limit(50);

  for (const job of exhaustedJobs) {
    await tx
      .update(ingestionJobs)
      .set({
        status: 'failed',
        error: `Exceeded max attempts (${job.maxAttempts})`,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));
  }

  const processingHostCounts = await getProcessingHostCounts(tx);

  const candidateLimit = Math.max(limit * CLAIM_CANDIDATE_MULTIPLIER, limit);
  const candidateResult = await tx.execute(
    drizzleSql`
      select *
      from ingestion_jobs
      where status = 'pending'
        and run_at <= ${now}
        and attempts < max_attempts
      order by priority asc, run_at asc
      limit ${candidateLimit}
      for update skip locked
    `
  );

  const candidates =
    candidateResult.rows as (typeof ingestionJobs.$inferSelect)[];

  const hostCounts = new Map(processingHostCounts);
  const selectedIds: string[] = [];

  for (const candidate of candidates) {
    const host = getJobHost(candidate);

    if (host) {
      const current = hostCounts.get(host) ?? 0;
      if (current >= MAX_CONCURRENT_JOBS_PER_HOST) {
        continue;
      }
      hostCounts.set(host, current + 1);
    }

    selectedIds.push(candidate.id);

    if (selectedIds.length >= limit) break;
  }

  if (selectedIds.length === 0) return [];

  return tx
    .update(ingestionJobs)
    .set({
      status: 'processing',
      attempts: drizzleSql`${ingestionJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(ingestionJobs.id, selectedIds))
    .returning();
}

/**
 * Mark a job as failed with optional retry scheduling.
 */
export async function failJob(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect,
  error: string,
  options: { reason?: JobFailureReason } = {}
): Promise<void> {
  const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const shouldRetry = job.attempts < maxAttempts;
  const reason = options.reason ?? 'transient';

  if (shouldRetry) {
    const backoffMs = calculateBackoff(job.attempts, reason);
    const nextRunAt = new Date(Date.now() + backoffMs);

    logger.info('Scheduling job retry', {
      jobId: job.id,
      attempt: job.attempts,
      maxAttempts,
      reason,
      nextRunAt,
      backoffMs,
    });

    await tx
      .update(ingestionJobs)
      .set({
        status: 'pending',
        error,
        nextRunAt,
        runAt: nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));
  } else {
    logger.warn('Job failed permanently', {
      jobId: job.id,
      attempts: job.attempts,
      maxAttempts,
      error,
    });

    await tx
      .update(ingestionJobs)
      .set({
        status: 'failed',
        error,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));
  }
}

/**
 * Mark a job as succeeded.
 */
export async function succeedJob(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect
): Promise<void> {
  await tx
    .update(ingestionJobs)
    .set({
      status: 'succeeded',
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, job.id));
}

/**
 * Reset a failed job for retry (admin action).
 */
export async function resetJobForRetry(
  tx: DbType,
  jobId: string
): Promise<boolean> {
  const [updated] = await tx
    .update(ingestionJobs)
    .set({
      status: 'pending',
      error: null,
      attempts: 0,
      runAt: new Date(),
      nextRunAt: null,
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, jobId))
    .returning({ id: ingestionJobs.id });

  return !!updated;
}
