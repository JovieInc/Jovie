import { and, sql as drizzleSql, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, ingestionJobs } from '@/lib/db';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import { isLinktreeUrl } from './strategies/linktree';

const linktreeJobPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string(),
  depth: z.number().int().min(0).max(3).default(0),
});

export async function enqueueLinktreeIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isLinktreeUrl(params.sourceUrl)) {
    return null;
  }

  const normalizedSource = normalizeUrl(params.sourceUrl);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = linktreeJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  // Migration-safe dedup check: handles both indexed column AND legacy JSONB payload
  // During migration window, existing records may have dedup_key = NULL
  // After migration 0008 completes, all records will have dedup_key populated
  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_linktree'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          // Check indexed column (fast path after migration)
          eq(ingestionJobs.dedupKey, payload.dedupKey),
          // Fallback: check JSONB payload for legacy records with NULL dedup_key
          and(
            isNull(ingestionJobs.dedupKey),
            drizzleSql`${ingestionJobs.payload} ->> 'dedupKey' = ${payload.dedupKey}`
          )
        )
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_linktree',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .returning({ id: ingestionJobs.id });

  return inserted?.id ?? null;
}
