import { and, sql as drizzleSql, eq, isNull, or } from 'drizzle-orm';
import { type DbType, ingestionJobs } from '@/lib/db';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { isBeaconsUrl, validateBeaconsUrl } from './strategies/beacons';
import { validateLayloUrl } from './strategies/laylo';
import { validateLinktreeUrl } from './strategies/linktree';
import { isYouTubeChannelUrl } from './strategies/youtube';
import type { ExtractionResult } from './types';

/**
 * Supported recursive job types for follow-up ingestion.
 */
type SupportedRecursiveJobType =
  | 'import_linktree'
  | 'import_laylo'
  | 'import_youtube'
  | 'import_beacons';

/**
 * Maximum depth allowed for each job type.
 */
const MAX_DEPTH_BY_JOB_TYPE: Record<SupportedRecursiveJobType, number> = {
  import_linktree: 3,
  import_laylo: 3,
  import_youtube: 1,
  import_beacons: 3,
};

/**
 * Enqueue a single ingestion job within a transaction.
 * Returns the job ID if created or found, null if depth exceeded.
 */
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

  const detected = detectPlatform(sourceUrl);
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
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  // Returns null when conflict occurred (job already exists)
  return inserted?.id ?? null;
}

/**
 * Determines the job type and validated URL for a given link.
 * Returns null if the link doesn't match any supported platform.
 */
function classifyLink(
  url: string
): { jobType: SupportedRecursiveJobType; sourceUrl: string } | null {
  // YouTube
  if (isYouTubeChannelUrl(url)) {
    return { jobType: 'import_youtube', sourceUrl: url };
  }

  // Beacons
  const validatedBeacons = validateBeaconsUrl(url);
  if (validatedBeacons && isBeaconsUrl(validatedBeacons)) {
    return { jobType: 'import_beacons', sourceUrl: validatedBeacons };
  }

  // Linktree
  const validatedLinktree = validateLinktreeUrl(url);
  if (validatedLinktree) {
    return { jobType: 'import_linktree', sourceUrl: validatedLinktree };
  }

  // Laylo
  const validatedLaylo = validateLayloUrl(url);
  if (validatedLaylo) {
    return { jobType: 'import_laylo', sourceUrl: validatedLaylo };
  }

  return null;
}

/**
 * Enqueue follow-up ingestion jobs for discovered links.
 * Detects platform types and creates appropriate jobs for recursive ingestion.
 *
 * Jobs are enqueued sequentially within the transaction to ensure reliable
 * execution (Promise.all is not supported within Drizzle transactions).
 */
export async function enqueueFollowupIngestionJobs(params: {
  tx: DbType;
  creatorProfileId: string;
  currentDepth: number;
  extraction: ExtractionResult;
}): Promise<void> {
  const { tx, creatorProfileId, currentDepth, extraction } = params;

  const nextDepth = currentDepth + 1;

  // Classify all links and filter to valid ones
  type ClassifiedJob = {
    jobType: SupportedRecursiveJobType;
    sourceUrl: string;
  };
  const jobsToEnqueue = extraction.links
    .filter(link => link.url)
    .map(link => classifyLink(link.url!))
    .filter((job): job is ClassifiedJob => job !== null);

  // Enqueue jobs sequentially (Promise.all not supported in Drizzle tx)
  for (const job of jobsToEnqueue) {
    await enqueueIngestionJobTx({
      tx,
      jobType: job.jobType,
      creatorProfileId,
      sourceUrl: job.sourceUrl,
      depth: nextDepth,
    });
  }
}
