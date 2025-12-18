import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, ingestionJobs } from '@/lib/db';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import { isBeaconsUrl } from './strategies/beacons';
import { isLinktreeUrl } from './strategies/linktree';
import { detectIngestionPlatform, type IngestionPlatform } from './strategies';

const ingestionJobPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string(),
  depth: z.number().int().min(0).max(3).default(0),
});

type IngestionJobType = 'import_linktree' | 'import_beacons';

const platformToJobType: Record<Exclude<IngestionPlatform, 'unknown'>, IngestionJobType> = {
  linktree: 'import_linktree',
  beacons: 'import_beacons',
};

/**
 * Generic ingestion job enqueue function.
 * Detects platform from URL and creates appropriate job.
 */
export async function enqueueIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
  platform?: IngestionPlatform;
}): Promise<{ jobId: string | null; platform: IngestionPlatform }> {
  const platform = params.platform ?? detectIngestionPlatform(params.sourceUrl);

  if (platform === 'unknown') {
    return { jobId: null, platform };
  }

  const normalizedSource = normalizeUrl(params.sourceUrl);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = ingestionJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const jobType = platformToJobType[platform];

  // Check for existing job with same dedup key
  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, jobType),
        drizzleSql`${ingestionJobs.payload} ->> 'dedupKey' = ${payload.dedupKey}`,
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { jobId: existing[0].id, platform };
  }

  const [inserted] = await db
    .insert(ingestionJobs)
    .values({
      jobType,
      payload,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .returning({ id: ingestionJobs.id });

  return { jobId: inserted?.id ?? null, platform };
}

/**
 * Enqueue a Linktree ingestion job.
 * @deprecated Use enqueueIngestionJob instead for multi-platform support.
 */
export async function enqueueLinktreeIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isLinktreeUrl(params.sourceUrl)) {
    return null;
  }

  const result = await enqueueIngestionJob({
    ...params,
    platform: 'linktree',
  });

  return result.jobId;
}

/**
 * Enqueue a Beacons.ai ingestion job.
 */
export async function enqueueBeaconsIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isBeaconsUrl(params.sourceUrl)) {
    return null;
  }

  const result = await enqueueIngestionJob({
    ...params,
    platform: 'beacons',
  });

  return result.jobId;
}
