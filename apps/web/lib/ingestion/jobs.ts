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

// ============================================================================
// Generic Ingestion Job Enqueue Helper
// ============================================================================

/**
 * Enqueue an ingestion job with dedup-safe insert.
 *
 * Handles the common pattern of:
 * 1. Check if a job with the same dedupKey already exists (migration-safe: checks both indexed column and legacy JSONB)
 * 2. Insert with onConflictDoNothing to prevent concurrent duplicates
 * 3. Handle race conditions by fetching the winning row
 */
async function enqueueJob(opts: {
  jobType: string;
  payload: Record<string, unknown> & {
    creatorProfileId: string;
    dedupKey: string;
  };
  dedupKey: string;
  priority?: number;
  useLegacyDedupCheck?: boolean;
}): Promise<string | null> {
  const {
    jobType,
    payload,
    dedupKey,
    priority = 0,
    useLegacyDedupCheck = false,
  } = opts;

  // Check if a job already exists for this dedup key
  if (useLegacyDedupCheck) {
    // Migration-safe dedup: handles both indexed column AND legacy JSONB payload
    const existing = await db
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.jobType, jobType),
          drizzleSql`${ingestionJobs.payload} ->> 'creatorProfileId' = ${payload.creatorProfileId}`,
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
  } else {
    // Fast-path: check indexed column only
    const existing = await db
      .select({ id: ingestionJobs.id })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.dedupKey, dedupKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }
  }

  // Atomic insert — unique index on dedup_key prevents concurrent duplicates
  const result = await db
    .insert(ingestionJobs)
    .values({
      jobType,
      payload,
      dedupKey,
      status: 'pending',
      runAt: new Date(),
      priority,
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

// ============================================================================
// Platform-Specific URL Normalization Helper
// ============================================================================

/**
 * Validate and normalize a platform URL, returning a dedup key and payload.
 * Returns null if the URL is invalid for the given platform.
 */
function normalizePlatformUrl(
  sourceUrl: string,
  creatorProfileId: string,
  schema: { parse: (v: unknown) => Record<string, unknown> },
  depth: number,
  validator?: (url: string) => string | null,
  checker?: (url: string) => boolean
): {
  payload: Record<string, unknown> & {
    creatorProfileId: string;
    dedupKey: string;
  };
  dedupKey: string;
} | null {
  let url = sourceUrl;

  if (validator) {
    const validated = validator(url);
    if (!validated) return null;
    url = validated;
  }

  if (checker && !checker(url)) return null;

  const normalizedSource = normalizeUrl(url);
  const detected = detectPlatform(normalizedSource);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = schema.parse({
    creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth,
  }) as Record<string, unknown> & {
    creatorProfileId: string;
    dedupKey: string;
  };

  return { payload, dedupKey };
}

// ============================================================================
// Platform Enqueue Functions
// ============================================================================

export async function enqueueLinktreeIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isLinktreeUrl(params.sourceUrl)) return null;

  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    linktreeJobPayloadSchema,
    params.depth ?? 0
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_linktree',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueInstagramIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    instagramJobPayloadSchema,
    params.depth ?? 0,
    validateInstagramUrl,
    isInstagramUrl
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_instagram',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueTikTokIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    tiktokJobPayloadSchema,
    params.depth ?? 0,
    validateTikTokUrl,
    isTikTokUrl
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_tiktok',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueTwitterIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    twitterJobPayloadSchema,
    params.depth ?? 0,
    validateTwitterUrl,
    isTwitterUrl
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_twitter',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueBeaconsIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    beaconsJobPayloadSchema,
    params.depth ?? 0,
    validateBeaconsUrl,
    isBeaconsUrl
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_beacons',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueYouTubeIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  const validated = validateYouTubeChannelUrl(params.sourceUrl);
  if (!validated || !isYouTubeChannelUrl(validated)) return null;

  const detected = detectPlatform(validated);
  const dedupKey = canonicalIdentity({
    platform: detected.platform,
    normalizedUrl: detected.normalizedUrl,
  });

  const payload = youtubeJobPayloadSchema.parse({
    creatorProfileId: params.creatorProfileId,
    sourceUrl: detected.normalizedUrl,
    dedupKey,
    depth: params.depth ?? 0,
  }) as Record<string, unknown> & {
    creatorProfileId: string;
    dedupKey: string;
  };

  return enqueueJob({
    jobType: 'import_youtube',
    payload,
    dedupKey,
    useLegacyDedupCheck: true,
  });
}

export async function enqueueLayloIngestionJob(params: {
  creatorProfileId: string;
  sourceUrl: string;
  depth?: number;
}): Promise<string | null> {
  if (!isLayloUrl(params.sourceUrl)) return null;

  const normalized = normalizePlatformUrl(
    params.sourceUrl,
    params.creatorProfileId,
    layloJobPayloadSchema,
    params.depth ?? 0
  );
  if (!normalized) return null;

  return enqueueJob({
    jobType: 'import_laylo',
    payload: normalized.payload,
    dedupKey: normalized.dedupKey,
    useLegacyDedupCheck: true,
  });
}

// ============================================================================
// DSP Discovery & Enrichment Jobs
// ============================================================================

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
  const providers = (params.targetProviders ?? ['apple_music'])
    .sort((a, b) => a.localeCompare(b))
    .join(',');
  const dedupKey = `dsp_discovery:${params.creatorProfileId}:${providers}`;

  return enqueueJob({
    jobType: 'dsp_artist_discovery',
    payload: {
      creatorProfileId: params.creatorProfileId,
      spotifyArtistId: params.spotifyArtistId,
      targetProviders: params.targetProviders ?? ['apple_music'],
      dedupKey,
    },
    dedupKey,
    priority: 1,
  });
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

  return enqueueJob({
    jobType: 'dsp_track_enrichment',
    payload: {
      creatorProfileId: params.creatorProfileId,
      matchId: params.matchId,
      providerId: params.providerId,
      externalArtistId: params.externalArtistId,
      dedupKey,
    },
    dedupKey,
    priority: 2,
  });
}

/**
 * Enqueue a MusicFetch enrichment job.
 *
 * Looks up an artist via MusicFetch.io to discover cross-platform
 * DSP profiles (Apple Music, Deezer, Tidal, etc.) and social links
 * (Instagram, TikTok, etc.) in a single API call.
 *
 * Triggered after a user connects their Spotify artist profile.
 *
 * @param params - Job parameters
 * @returns Job ID if created, null if deduplicated
 */
export async function enqueueMusicFetchEnrichmentJob(params: {
  creatorProfileId: string;
  spotifyUrl: string;
}): Promise<string | null> {
  const dedupKey = `musicfetch_enrichment:${params.creatorProfileId}`;

  return enqueueJob({
    jobType: 'musicfetch_enrichment',
    payload: {
      creatorProfileId: params.creatorProfileId,
      spotifyUrl: params.spotifyUrl,
      dedupKey,
    },
    dedupKey,
    priority: 1,
  });
}
