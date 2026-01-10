import { and, sql as drizzleSql, eq, isNull, or } from 'drizzle-orm';
import { type DbType, ingestionJobs } from '@/lib/db';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { isBeaconsUrl, validateBeaconsUrl } from './strategies/beacons';
import { isFeatureFmUrl, validateFeatureFmUrl } from './strategies/featurefm';
import { validateLayloUrl } from './strategies/laylo';
import { isLinkfireUrl, validateLinkfireUrl } from './strategies/linkfire';
import { validateLinktreeUrl } from './strategies/linktree';
import { isToneDenUrl, validateToneDenUrl } from './strategies/toneden';
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
  | 'import_linkfire'
  | 'import_featurefm'
  | 'import_toneden';

/**
 * Maximum depth allowed for each job type.
 */
const MAX_DEPTH_BY_JOB_TYPE: Record<SupportedRecursiveJobType, number> = {
  import_linktree: 3,
  import_laylo: 3,
  import_youtube: 1,
  import_beacons: 3,
  import_linkfire: 2,
  import_featurefm: 2,
  import_toneden: 2,
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
    .returning({ id: ingestionJobs.id });

  return inserted?.id ?? null;
}

/**
 * Enqueue follow-up ingestion jobs for discovered links.
 * Detects platform types and creates appropriate jobs for recursive ingestion.
 */
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

    // Linktree
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

    // Laylo
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

    // Linkfire
    const validatedLinkfire = validateLinkfireUrl(url);
    if (validatedLinkfire && isLinkfireUrl(validatedLinkfire)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_linkfire',
        creatorProfileId,
        sourceUrl: validatedLinkfire,
        depth: nextDepth,
      });
      continue;
    }

    // Feature.fm
    const validatedFeaturefm = validateFeatureFmUrl(url);
    if (validatedFeaturefm && isFeatureFmUrl(validatedFeaturefm)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_featurefm',
        creatorProfileId,
        sourceUrl: validatedFeaturefm,
        depth: nextDepth,
      });
      continue;
    }

    // ToneDen
    const validatedToneden = validateToneDenUrl(url);
    if (validatedToneden && isToneDenUrl(validatedToneden)) {
      await enqueueIngestionJobTx({
        tx,
        jobType: 'import_toneden',
        creatorProfileId,
        sourceUrl: validatedToneden,
        depth: nextDepth,
      });
    }
  }
}
