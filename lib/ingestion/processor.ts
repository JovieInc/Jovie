import { and, asc, eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  creatorProfiles,
  type DbType,
  ingestionJobs,
  socialLinks,
} from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { computeLinkConfidence } from './confidence';
import { applyProfileEnrichment } from './profile';
import { extractLinktree, fetchLinktreeDocument } from './strategies/linktree';
import { type ExtractionResult } from './types';

// Retry configuration
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 5000; // 5 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes

/**
 * Calculate exponential backoff delay with jitter.
 */
function calculateBackoff(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000; // 0-1 second jitter
  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_MS);
}

const linktreePayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

type SocialLinkRow = typeof socialLinks.$inferSelect;

function mergeEvidence(
  existing: Record<string, unknown> | null,
  incoming?: { sources?: string[]; signals?: string[] }
): Record<string, unknown> {
  const baseSources =
    Array.isArray((existing as { sources?: string[] })?.sources) &&
    ((existing as { sources?: unknown[] }).sources ?? []).every(
      item => typeof item === 'string'
    )
      ? ((existing as { sources?: string[] }).sources as string[])
      : [];
  const baseSignals =
    Array.isArray((existing as { signals?: string[] })?.signals) &&
    ((existing as { signals?: unknown[] }).signals ?? []).every(
      item => typeof item === 'string'
    )
      ? ((existing as { signals?: string[] }).signals as string[])
      : [];

  const nextSources = new Set([...baseSources, ...(incoming?.sources ?? [])]);
  const nextSignals = new Set([...baseSignals, ...(incoming?.signals ?? [])]);

  return {
    sources: Array.from(nextSources),
    signals: Array.from(nextSignals),
  };
}

export async function normalizeAndMergeExtraction(
  tx: DbType,
  profile: {
    id: string;
    usernameNormalized: string | null;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean | null;
    displayNameLocked: boolean | null;
  },
  extraction: ExtractionResult
): Promise<{ inserted: number; updated: number }> {
  const existingRows = await tx
    .select()
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profile.id));

  const existingByCanonical = new Map<string, SocialLinkRow>();

  for (const row of existingRows) {
    try {
      const detected = detectPlatform(row.url);
      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      existingByCanonical.set(canonical, row);
    } catch {
      // Skip rows with unparseable URLs; ingestion will not mutate them
    }
  }

  let inserted = 0;
  let updated = 0;
  const sortStart = existingRows.length;

  for (const link of extraction.links) {
    try {
      const detected = detectPlatform(link.url);
      if (!detected.isValid) continue;

      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      const evidence = mergeEvidence(null, link.evidence);
      const { confidence, state } = computeLinkConfidence({
        sourceType: 'ingested',
        signals: ['linktree_profile_link'],
        sources: ['linktree'],
        usernameNormalized: profile.usernameNormalized,
        url: detected.normalizedUrl,
      });

      const existing = existingByCanonical.get(canonical);
      if (existing) {
        const existingState =
          (existing.state as 'active' | 'suggested' | 'rejected' | null) ||
          (existing.isActive ? 'active' : 'suggested');
        const mergedEvidence = mergeEvidence(
          (existing.evidence as Record<string, unknown>) ?? null,
          link.evidence
        );
        const merged = computeLinkConfidence({
          sourceType: existing.sourceType ?? 'ingested',
          signals: mergedEvidence.signals as string[] | undefined,
          sources: mergedEvidence.sources as string[] | undefined,
          usernameNormalized: profile.usernameNormalized,
          url: detected.normalizedUrl,
          existingConfidence:
            typeof existing.confidence === 'number'
              ? existing.confidence
              : null,
        });

        await tx
          .update(socialLinks)
          .set({
            url: detected.normalizedUrl,
            displayText: link.title ?? existing.displayText,
            sourcePlatform: existing.sourcePlatform ?? link.sourcePlatform,
            sourceType: existing.sourceType ?? 'manual',
            evidence: mergedEvidence,
            // Persist confidence as a fixed-point string to match the numeric column type
            confidence: merged.confidence.toFixed(2),
            state:
              existing.sourceType === 'ingested' ? merged.state : existingState,
            isActive:
              (existing.sourceType === 'ingested'
                ? merged.state
                : existingState) === 'active',
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, existing.id));
        updated += 1;
        continue;
      }

      const insertPayload: typeof socialLinks.$inferInsert = {
        creatorProfileId: profile.id,
        platform: detected.platform.id,
        platformType: detected.platform.id,
        url: detected.normalizedUrl,
        displayText: link.title,
        sortOrder: sortStart + inserted,
        isActive: state === 'active',
        state,
        // socialLinks.confidence is a numeric column backed by a string type in Drizzle,
        // so we persist the formatted string here and use the raw number only in-memory.
        confidence: confidence.toFixed(2),
        sourcePlatform: link.sourcePlatform ?? 'linktree',
        sourceType: 'ingested',
        evidence,
      };

      await tx.insert(socialLinks).values(insertPayload);
      existingByCanonical.set(canonical, {
        id: '',
        creatorProfileId: profile.id,
        platform: detected.platform.id,
        platformType: detected.platform.id,
        url: detected.normalizedUrl,
        displayText: link.title,
        sortOrder: sortStart + inserted,
        isActive: state === 'active',
        state,
        confidence,
        sourcePlatform: link.sourcePlatform ?? 'linktree',
        sourceType: 'ingested',
        evidence,
        clicks: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as SocialLinkRow);
      inserted += 1;
    } catch (error) {
      logger.warn('normalizeAndMergeExtraction failed for link', {
        error,
        link,
      });
    }
  }

  // Apply basic enrichment for display name and avatar (phase 3 rules: respect locks)
  await applyProfileEnrichment(tx, {
    profileId: profile.id,
    displayNameLocked: profile.displayNameLocked,
    avatarLockedByUser: profile.avatarLockedByUser,
    currentDisplayName: profile.displayName,
    currentAvatarUrl: profile.avatarUrl,
    extractedDisplayName: extraction.displayName ?? null,
    extractedAvatarUrl: extraction.avatarUrl ?? null,
  });

  return { inserted, updated };
}

export async function processLinktreeJob(tx: DbType, jobPayload: unknown) {
  const parsed = linktreePayloadSchema.parse(jobPayload);

  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      avatarUrl: creatorProfiles.avatarUrl,
      displayName: creatorProfiles.displayName,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      displayNameLocked: creatorProfiles.displayNameLocked,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, parsed.creatorProfileId))
    .limit(1);

  if (!profile) {
    throw new Error('Creator profile not found for ingestion job');
  }

  await tx
    .update(creatorProfiles)
    .set({ ingestionStatus: 'processing', updatedAt: new Date() })
    .where(eq(creatorProfiles.id, profile.id));

  try {
    const html = await fetchLinktreeDocument(parsed.sourceUrl);
    const extraction = extractLinktree(html);
    const result = await normalizeAndMergeExtraction(tx, profile, extraction);

    await tx
      .update(creatorProfiles)
      .set({ ingestionStatus: 'idle', updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profile.id));

    return {
      ...result,
      sourceUrl: parsed.sourceUrl,
      extractedLinks: extraction.links.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Linktree ingestion failed';
    await tx
      .update(creatorProfiles)
      .set({
        ingestionStatus: 'failed',
        lastIngestionError: message,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));
    throw error;
  }
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
  // Only select jobs that haven't exceeded max attempts
  const candidates = await tx
    .select()
    .from(ingestionJobs)
    .where(
      and(eq(ingestionJobs.status, 'pending'), lte(ingestionJobs.runAt, now))
    )
    .orderBy(asc(ingestionJobs.priority), asc(ingestionJobs.runAt))
    .limit(limit);

  const claimed: (typeof ingestionJobs.$inferSelect)[] = [];

  for (const candidate of candidates) {
    // Skip if already at max attempts
    const maxAttempts = candidate.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (candidate.attempts >= maxAttempts) {
      // Mark as failed if at max attempts
      await tx
        .update(ingestionJobs)
        .set({
          status: 'failed',
          error: `Exceeded max attempts (${maxAttempts})`,
          updatedAt: new Date(),
        })
        .where(eq(ingestionJobs.id, candidate.id));
      continue;
    }

    const [updated] = await tx
      .update(ingestionJobs)
      .set({
        status: 'processing',
        attempts: candidate.attempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestionJobs.id, candidate.id),
          eq(ingestionJobs.status, 'pending')
        )
      )
      .returning();

    if (updated) {
      claimed.push(updated);
    }
  }

  return claimed;
}

/**
 * Mark a job as failed with optional retry scheduling.
 * If attempts < maxAttempts, schedules retry with exponential backoff.
 */
export async function failJob(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect,
  error: string
): Promise<void> {
  const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const shouldRetry = job.attempts < maxAttempts;

  if (shouldRetry) {
    const backoffMs = calculateBackoff(job.attempts);
    const nextRunAt = new Date(Date.now() + backoffMs);

    logger.info('Scheduling job retry', {
      jobId: job.id,
      attempt: job.attempts,
      maxAttempts,
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
 * Clears error, resets attempts, and sets status to pending.
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

export async function processJob(
  tx: DbType,
  job: typeof ingestionJobs.$inferSelect
) {
  switch (job.jobType) {
    case 'import_linktree':
      return processLinktreeJob(tx, job.payload);
    default:
      throw new Error(`Unsupported ingestion job type: ${job.jobType}`);
  }
}
