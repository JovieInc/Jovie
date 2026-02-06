import { and, sql as drizzleSql, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import {
  beaconsJobPayloadSchema,
  instagramJobPayloadSchema,
  layloJobPayloadSchema,
  linktreeJobPayloadSchema,
  tiktokJobPayloadSchema,
  twitterJobPayloadSchema,
  youtubeJobPayloadSchema,
} from '@/lib/validation/schemas';
import { isBeaconsUrl, validateBeaconsUrl } from './strategies/beacons';
import { isInstagramUrl, validateInstagramUrl } from './strategies/instagram';
import { isLayloUrl } from './strategies/laylo';
import { isLinktreeUrl } from './strategies/linktree';
import { isTikTokUrl, validateTikTokUrl } from './strategies/tiktok';
import { isTwitterUrl, validateTwitterUrl } from './strategies/twitter';
import {
  isYouTubeChannelUrl,
  validateYouTubeChannelUrl,
} from './strategies/youtube';

// Ingestion job payload schemas are now centralized in @/lib/validation/schemas/ingestion.ts

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

  const result = await db
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
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  // Race condition: another concurrent insert won — return the existing job's id
  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueInstagramIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateInstagramUrl(params.sourceUrl);
  if (!validated || !isInstagramUrl(validated)) {
    return null;
  }

  const normalizedSource = normalizeUrl(validated);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = instagramJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_instagram'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_instagram',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueTikTokIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateTikTokUrl(params.sourceUrl);
  if (!validated || !isTikTokUrl(validated)) {
    return null;
  }

  const normalizedSource = normalizeUrl(validated);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = tiktokJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_tiktok'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_tiktok',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueTwitterIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateTwitterUrl(params.sourceUrl);
  if (!validated || !isTwitterUrl(validated)) {
    return null;
  }

  const normalizedSource = normalizeUrl(validated);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = twitterJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_twitter'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_twitter',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueBeaconsIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateBeaconsUrl(params.sourceUrl);
  if (!validated || !isBeaconsUrl(validated)) {
    return null;
  }

  const normalizedSource = normalizeUrl(validated);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = beaconsJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_beacons'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_beacons',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueYouTubeIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateYouTubeChannelUrl(params.sourceUrl);
  if (!validated || !isYouTubeChannelUrl(validated)) {
    return null;
  }

  const normalizedSource = validated;
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = youtubeJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_youtube'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_youtube',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

export async function enqueueLayloIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isLayloUrl(params.sourceUrl)) {
    return null;
  }

  const normalizedSource = normalizeUrl(params.sourceUrl);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = layloJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  });

  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'import_laylo'),
        drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
        or(
          eq(ingestionJobs.dedupKey, payload.dedupKey),
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

  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'import_laylo',
      payload,
      dedupKey: payload.dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 0,
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, payload.dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

/**
 * Enqueue a DSP artist discovery job.
 *
 * Discovers matching artist profiles on other DSPs (like Apple Music)
 * for a creator profile using ISRC-based matching.
 *
 * @param params - Job parameters
 * @returns Job ID if created, null if deduplicated
 */
export async function enqueueDspArtistDiscoveryJob(params: {
  creatorProfileId: string;
  spotifyArtistId: string;
  targetProviders?: ('apple_music' | 'deezer' | 'musicbrainz')[];
}): Promise<string | null> {
  const dedupKey = `dsp_discovery:${params.creatorProfileId}`;

  const payload = {
    creatorProfileId: params.creatorProfileId,
    spotifyArtistId: params.spotifyArtistId,
    targetProviders: params.targetProviders ?? ['apple_music'],
    dedupKey,
  };

  // Fast-path: check if a job already exists for this profile
  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, dedupKey))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Atomic insert — unique index on dedup_key prevents concurrent duplicates
  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'dsp_artist_discovery',
      payload,
      dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 1, // Higher priority for user-triggered discovery
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  // Race condition: another concurrent insert won — return the existing job's id
  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, dedupKey))
    .limit(1);

  return winner?.id ?? null;
}

/**
 * Enqueue a DSP track enrichment job.
 *
 * Called after a DSP artist match is confirmed to enrich tracks with
 * links to the matched artist's profile on that provider.
 *
 * @param params - Job parameters
 * @returns Job ID if created, null if deduplicated
 */
export async function enqueueDspTrackEnrichmentJob(params: {
  creatorProfileId: string;
  matchId: string;
  providerId: 'apple_music' | 'deezer' | 'musicbrainz';
  externalArtistId: string;
}): Promise<string | null> {
  const dedupKey = `dsp_track_enrichment:${params.matchId}`;

  const payload = {
    creatorProfileId: params.creatorProfileId,
    matchId: params.matchId,
    providerId: params.providerId,
    externalArtistId: params.externalArtistId,
  };

  // Fast-path: check if a job already exists for this match
  const existing = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, dedupKey))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Atomic insert — unique index on dedup_key prevents concurrent duplicates
  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType: 'dsp_track_enrichment',
      payload,
      dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority: 2, // Medium priority for enrichment
      attempts: 0,
    })
    .onConflictDoNothing({ target: ingestionJobs.dedupKey })
    .returning({ id: ingestionJobs.id });

  if (result.length > 0) {
    return result[0].id;
  }

  // Race condition: another concurrent insert won — return the existing job's id
  const [winner] = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.dedupKey, dedupKey))
    .limit(1);

  return winner?.id ?? null;
}
