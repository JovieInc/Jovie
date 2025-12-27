import {
  and,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
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
  validateLink,
} from '@/lib/utils/platform-detection';
import { computeLinkConfidence } from './confidence';
import { applyProfileEnrichment } from './profile';
import {
  extractAppleMusic,
  fetchAppleMusicDocument,
  isAppleMusicUrl,
  validateAppleMusicUrl,
} from './strategies/apple-music';
import { ExtractionError } from './strategies/base';
import {
  extractBeacons,
  fetchBeaconsDocument,
  isBeaconsUrl,
  validateBeaconsUrl,
} from './strategies/beacons';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  validateLayloUrl,
} from './strategies/laylo';
import {
  extractLinktree,
  fetchLinktreeDocument,
  validateLinktreeUrl,
} from './strategies/linktree';
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
  isYouTubeChannelUrl,
} from './strategies/youtube';
import { type ExtractionResult } from './types';

// Retry configuration
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 5000; // 5 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes
const RATE_LIMIT_BASE_BACKOFF_MS = 30000; // 30 seconds
const RATE_LIMIT_MAX_BACKOFF_MS = 900000; // 15 minutes

const MAX_CONCURRENT_JOBS_PER_HOST = 2;
const CLAIM_CANDIDATE_MULTIPLIER = 3;

const STUCK_PROCESSING_AFTER_MS = 20 * 60 * 1000;

type JobFailureReason = 'rate_limited' | 'transient';

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
  const jitterRange = reason === 'rate_limited' ? 5000 : 1000; // broader jitter for rate limits
  const jitter = Math.random() * jitterRange; // small random jitter to avoid thundering herd
  return Math.min(exponentialDelay + jitter, cap);
}

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

function getCreatorProfileIdFromJob(
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
    case 'import_apple_music': {
      const parsed = appleMusicPayloadSchema.safeParse(job.payload);
      return parsed.success ? parsed.data.creatorProfileId : null;
    }
    default:
      return null;
  }
}

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
    await tx
      .update(creatorProfiles)
      .set({
        ...(shouldRetry ? {} : { ingestionStatus: 'failed' as const }),
        lastIngestionError: message,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));
  }

  // TODO: Re-enable failJob once job-utils module is available
  // await failJob(tx, job, message, { reason });

  // Temporary inline implementation for retry scheduling
  if (shouldRetry) {
    const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 300000);
    const nextRunAt = new Date(Date.now() + backoffMs);

    await tx
      .update(ingestionJobs)
      .set({
        status: 'pending',
        error: message,
        nextRunAt,
        runAt: nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));
  } else {
    await tx
      .update(ingestionJobs)
      .set({
        status: 'failed',
        error: message,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));
  }
}

const linktreePayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

const layloPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

const youtubePayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(1).default(0),
});

const beaconsPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

const appleMusicPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(1).default(0),
});

type SocialLinkRow = typeof socialLinks.$inferSelect;

type SupportedRecursiveJobType =
  | 'import_linktree'
  | 'import_laylo'
  | 'import_youtube'
  | 'import_beacons'
  | 'import_apple_music';

const MAX_DEPTH_BY_JOB_TYPE: Record<SupportedRecursiveJobType, number> = {
  import_linktree: 3,
  import_laylo: 3,
  import_youtube: 1,
  import_beacons: 3,
  import_apple_music: 1,
};

async function enqueueIngestionJobTx(params: {
  tx: DbType;
  jobType: SupportedRecursiveJobType;
  creatorProfileId: string;
  sourceUrl: string;
  depth: number;
}): Promise<string | null> {
  const { tx, jobType, creatorProfileId, sourceUrl, depth } = params;

  const maxDepth = MAX_DEPTH_BY_JOB_TYPE[jobType];
  if (depth > maxDepth) return null;

  const detected = validateLink(sourceUrl);
  if (!detected || !detected.isValid) {
    return null;
  }
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = {
    creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth,
  };

  const existing = await tx
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, jobType),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, dedupKey),
          and(
            isNull(ingestionJobs.dedupKey),
            drizzleSql`${ingestionJobs.payload} ->> 'dedupKey' = ${dedupKey}`
          )
        )
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [inserted] = await tx
    .insert(ingestionJobs)
    .values({
      jobType,
      payload,
      dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      updatedAt: new Date(),
    })
    .returning({ id: ingestionJobs.id });

  return inserted?.id ?? null;
}

export async function enqueueFollowupIngestionJobs(params: {
  tx: DbType;
  creatorProfileId: string;
  currentDepth: number;
  extraction: ExtractionResult;
}): Promise<void> {
  const { tx, creatorProfileId, currentDepth, extraction } = params;

  const nextDepth = currentDepth + 1;

  for (const link of extraction.links) {
    const url = link.url;
    if (!url) continue;

    // YouTube
    if (isYouTubeChannelUrl(url)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_youtube',
        creatorProfileId,
        sourceUrl: url,
        depth: nextDepth,
      });
      continue;
    }

    // Beacons
    const validatedBeacons = validateBeaconsUrl(url);
    if (validatedBeacons && isBeaconsUrl(validatedBeacons)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_beacons',
        creatorProfileId,
        sourceUrl: validatedBeacons,
        depth: nextDepth,
      });
      continue;
    }

    // Linktree / Laylo (string checks are cheap; validation occurs inside fetch)
    const validatedLinktree = validateLinktreeUrl(url);
    if (validatedLinktree) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_linktree',
        creatorProfileId,
        sourceUrl: validatedLinktree,
        depth: nextDepth,
      });
      continue;
    }

    const validatedLaylo = validateLayloUrl(url);
    if (validatedLaylo) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_laylo',
        creatorProfileId,
        sourceUrl: validatedLaylo,
        depth: nextDepth,
      });
      continue;
    }

    // Apple Music
    const validatedAppleMusic = validateAppleMusicUrl(url);
    if (validatedAppleMusic && isAppleMusicUrl(validatedAppleMusic)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_apple_music',
        creatorProfileId,
        sourceUrl: validatedAppleMusic,
        depth: nextDepth,
      });
    }
  }
}

function mergeEvidence(
  existing: Record<string, unknown> | null,
  incoming?: { sources?: string[]; signals?: string[] }
): { sources: string[]; signals: string[] } {
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

export function deriveLayloHandle(
  sourceUrl: string,
  usernameNormalized: string | null
): string {
  const handleFromUrl = extractLayloHandle(sourceUrl);
  if (handleFromUrl) return handleFromUrl;
  if (usernameNormalized) return usernameNormalized;

  throw new Error('Unable to determine Laylo handle from sourceUrl or profile');
}

export function createInMemorySocialLinkRow({
  profileId,
  platformId,
  platformCategory,
  url,
  displayText,
  sortOrder,
  isActive,
  state,
  confidence,
  sourcePlatform,
  evidence,
}: {
  profileId: string;
  platformId: string;
  platformCategory: string;
  url: string;
  displayText?: string | null;
  sortOrder: number;
  isActive: boolean;
  state: SocialLinkRow['state'];
  confidence: number;
  sourcePlatform?: string | null;
  evidence?: SocialLinkRow['evidence'];
}): SocialLinkRow {
  return {
    id: '',
    creatorProfileId: profileId,
    platform: platformId,
    platformType: platformCategory,
    url,
    displayText: displayText ?? null,
    sortOrder,
    isActive,
    state,
    confidence,
    sourcePlatform: sourcePlatform ?? 'linktree',
    sourceType: 'ingested',
    evidence: evidence ?? {},
    clicks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as SocialLinkRow;
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
      const detected = validateLink(row.url);
      if (!detected || !detected.isValid) continue;
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
      const detected = validateLink(link.url);
      if (!detected || !detected.isValid) continue;

      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      const evidence = mergeEvidence(null, link.evidence);
      const { confidence, state } = computeLinkConfidence({
        sourceType: 'ingested',
        signals:
          evidence.signals && evidence.signals.length > 0
            ? (evidence.signals as string[])
            : ['ingestion_profile_link'],
        sources:
          evidence.sources && evidence.sources.length > 0
            ? (evidence.sources as string[])
            : ['ingestion'],
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
            state: merged.state,
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, existing.id));

        updated++;
      } else {
        const row = createInMemorySocialLinkRow({
          profileId: profile.id,
          platformId: detected.platform.id,
          platformCategory: detected.platform.category,
          url: detected.normalizedUrl,
          displayText: link.title,
          sortOrder: sortStart + inserted,
          isActive: state === 'active',
          state,
          confidence,
          sourcePlatform: link.sourcePlatform,
          evidence,
        });

        await tx.insert(socialLinks).values(row);

        inserted++;
      }
    } catch {
      // Skip links with unparseable URLs
    }
  }

  return { inserted, updated };
}
