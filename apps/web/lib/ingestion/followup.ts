import { type DbOrTransaction, ingestionJobs } from '@/lib/db';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { isBeaconsUrl, validateBeaconsUrl } from './strategies/beacons';
import { isInstagramUrl, validateInstagramUrl } from './strategies/instagram';
import { validateLayloUrl } from './strategies/laylo';
import { validateLinktreeUrl } from './strategies/linktree';
import { isTikTokUrl, validateTikTokUrl } from './strategies/tiktok';
import { isTwitterUrl, validateTwitterUrl } from './strategies/twitter';
import { isYouTubeChannelUrl } from './strategies/youtube';
import type { ExtractionResult } from './types';

/**
 * Supported recursive job types for follow-up ingestion.
 */
type SupportedRecursiveJobType =
  | 'import_linktree'
  | 'import_laylo'
  | 'import_youtube'
  | 'import_beacons'
  | 'import_instagram'
  | 'import_tiktok'
  | 'import_twitter';

/**
 * Maximum depth allowed for each job type.
 */
const MAX_DEPTH_BY_JOB_TYPE: Record<SupportedRecursiveJobType, number> = {
  import_linktree: 3,
  import_laylo: 3,
  import_youtube: 1,
  import_beacons: 3,
  import_instagram: 2,
  import_tiktok: 2,
  import_twitter: 2,
};

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

  // Instagram
  const validatedInstagram = validateInstagramUrl(url);
  if (validatedInstagram && isInstagramUrl(validatedInstagram)) {
    return { jobType: 'import_instagram', sourceUrl: validatedInstagram };
  }

  // TikTok
  const validatedTikTok = validateTikTokUrl(url);
  if (validatedTikTok && isTikTokUrl(validatedTikTok)) {
    return { jobType: 'import_tiktok', sourceUrl: validatedTikTok };
  }

  // Twitter
  const validatedTwitter = validateTwitterUrl(url);
  if (validatedTwitter && isTwitterUrl(validatedTwitter)) {
    return { jobType: 'import_twitter', sourceUrl: validatedTwitter };
  }

  return null;
}

/**
 * Enqueue follow-up ingestion jobs for discovered links.
 * Detects platform types and creates appropriate jobs for recursive ingestion.
 *
 * Uses batch insert for O(1) database operations instead of O(N) sequential inserts.
 */
export async function enqueueFollowupIngestionJobs(params: {
  tx: DbOrTransaction;
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
  const classifiedJobs = extraction.links
    .filter(link => link.url)
    .map(link => classifyLink(link.url))
    .filter((job): job is ClassifiedJob => job !== null);

  // Build batch of job values, filtering by max depth
  const jobValues = classifiedJobs
    .filter(job => {
      const maxDepth = MAX_DEPTH_BY_JOB_TYPE[job.jobType];
      return nextDepth <= maxDepth;
    })
    .map(job => {
      const detected = detectPlatform(job.sourceUrl);
      const dedupKey = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });

      return {
        jobType: job.jobType,
        payload: {
          creatorProfileId,
          sourceUrl: detected.normalizedUrl,
          dedupKey,
          depth: nextDepth,
        },
        dedupKey,
        status: 'pending' as const,
        runAt: new Date(),
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        updatedAt: new Date(),
      };
    });

  // Skip if no valid jobs to enqueue
  if (jobValues.length === 0) return;

  // Batch insert all jobs in a single statement with conflict handling
  await tx
    .insert(ingestionJobs)
    .values(jobValues)
    .onConflictDoNothing({ target: ingestionJobs.dedupKey });
}
