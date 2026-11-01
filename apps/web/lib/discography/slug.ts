/**
 * Content Slug Generation and Validation
 *
 * Generates clean, URL-friendly slugs for releases and tracks.
 * Ensures uniqueness across both content types per creator.
 */

import { and, eq, isNull, like, ne } from 'drizzle-orm';
import { db, withRetry } from '@/lib/db';
import { QUERY_TIMEOUTS } from '@/lib/db/query-timeout';
import {
  contentSlugRedirects,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  discogTracks,
} from '@/lib/db/schema/content';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { logger } from '@/lib/utils/logger';
import { qualifierCandidates, type VersionType } from './slug-policy';

export type ContentType = 'release' | 'track' | 'release_track';

/**
 * Reserved slugs that conflict with static route segments at the track level.
 * Tracks with these slugs would be unreachable because Next.js
 * resolves static segments (e.g. /sounds/) before dynamic [trackSlug].
 * Only applies to tracks/release_tracks — releases don't conflict.
 */
const RESERVED_TRACK_SLUGS = new Set(['sounds']);

/** Check if a slug is reserved at the track level. */
export function isReservedTrackSlug(slug: string): boolean {
  return RESERVED_TRACK_SLUGS.has(generateBaseSlug(slug));
}

/** Map a content type + ID to the correct slug exclusion option. */
function buildExcludeOptions(contentType: ContentType, id?: string) {
  switch (contentType) {
    case 'release':
      return { excludeReleaseId: id };
    case 'release_track':
      return { excludeRecordingId: id };
    case 'track':
      return { excludeTrackId: id };
  }
}

/**
 * Generate a URL-safe slug from a title.
 * No longer appends Spotify ID suffix - uses collision numbering instead.
 */
export function generateBaseSlug(
  title: string,
  maxLength: number = 50
): string {
  // Guard against undefined to prevent runtime errors
  if (!title) return '';

  return (
    title
      .toLowerCase()
      // Normalize unicode characters (é → e, ñ → n, etc.)
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      // Remove special characters except spaces and hyphens
      .replaceAll(/[^a-z0-9\s-]/g, '')
      // Replace spaces with hyphens
      .replaceAll(/\s+/g, '-')
      // Collapse multiple hyphens
      .replaceAll(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replaceAll(/(^-)|(-$)/g, '')
      // Truncate to max length
      .slice(0, maxLength)
  );
}

/**
 * Check if a slug is available for a creator (across releases, tracks, and redirects).
 */
export async function isSlugAvailable(
  creatorProfileId: string,
  slug: string,
  options?: {
    excludeReleaseId?: string;
    excludeTrackId?: string;
    excludeRecordingId?: string;
    contentType?: ContentType;
  }
): Promise<boolean> {
  // Reserved track slugs conflict with static route segments (e.g. /sounds/)
  // Only block for tracks — releases at /{handle}/{slug} don't collide
  const ct = options?.contentType;
  if ((ct === 'track' || ct === 'release_track') && isReservedTrackSlug(slug))
    return false;

  const { excludeReleaseId, excludeTrackId, excludeRecordingId } =
    options ?? {};

  // Check releases
  const releaseConditions = [
    eq(discogReleases.creatorProfileId, creatorProfileId),
    eq(discogReleases.slug, slug),
  ];
  if (excludeReleaseId) {
    releaseConditions.push(ne(discogReleases.id, excludeReleaseId));
  }

  const [existingRelease] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(and(...releaseConditions))
    .limit(1);

  if (existingRelease) return false;

  // Check recordings (new model)
  const recordingConditions = [
    eq(discogRecordings.creatorProfileId, creatorProfileId),
    eq(discogRecordings.slug, slug),
  ];
  if (excludeRecordingId) {
    recordingConditions.push(ne(discogRecordings.id, excludeRecordingId));
  }

  const [existingRecording] = await db
    .select({ id: discogRecordings.id })
    .from(discogRecordings)
    .where(and(...recordingConditions))
    .limit(1);

  if (existingRecording) return false;

  // Check legacy tracks
  const trackConditions = [
    eq(discogTracks.creatorProfileId, creatorProfileId),
    eq(discogTracks.slug, slug),
  ];
  if (excludeTrackId) {
    trackConditions.push(ne(discogTracks.id, excludeTrackId));
  }

  const [existingTrack] = await db
    .select({ id: discogTracks.id })
    .from(discogTracks)
    .where(and(...trackConditions))
    .limit(1);

  if (existingTrack) return false;

  // Check redirects (old slugs should not be reused to prevent confusion)
  const [existingRedirect] = await db
    .select({ id: contentSlugRedirects.id })
    .from(contentSlugRedirects)
    .where(
      and(
        eq(contentSlugRedirects.creatorProfileId, creatorProfileId),
        eq(contentSlugRedirects.oldSlug, slug)
      )
    )
    .limit(1);

  return !existingRedirect;
}

export interface GenerateUniqueSlugOptions {
  /** Release year (fallback when no full date is known). */
  readonly year?: number | null;
  readonly releaseDate?: Date | null;
  /** Other `main_artist` credits besides the profile owner (co-primary). */
  readonly coPrimary?: readonly string[];
  readonly featured?: readonly string[];
  readonly remixers?: readonly string[];
  /** Explicit version metadata; never inferred from the title. */
  readonly versionType?: VersionType | null;
}

/**
 * Ordered slug candidates for collision resolution. Never numeric suffixes:
 * base, then version, co-primary (`-with-x`), featured, year, and combinations.
 */
export function buildSlugDisambiguationCandidates(
  baseSlug: string,
  options: GenerateUniqueSlugOptions = {}
): string[] {
  if (!baseSlug) return [];
  const releaseDate =
    options.releaseDate ??
    (typeof options.year === 'number' &&
    Number.isFinite(options.year) &&
    options.year >= 1000
      ? new Date(Date.UTC(options.year, 0, 1))
      : null);
  return [
    baseSlug,
    ...qualifierCandidates(baseSlug, {
      releaseDate,
      coPrimary: options.coPrimary ?? [],
      featured: options.featured ?? [],
      remixers: options.remixers ?? [],
      versionType: options.versionType ?? null,
    }).map(c => c.slug),
  ];
}

/**
 * Generate a unique slug for content, disambiguating with a meaningful
 * qualifier (see slug-policy.ts), never `-2`/`-3`.
 */
export async function generateUniqueSlug(
  creatorProfileId: string,
  title: string,
  contentType: ContentType,
  existingId?: string,
  options?: GenerateUniqueSlugOptions
): Promise<string> {
  const baseSlug = generateBaseSlug(title);

  if (!baseSlug) {
    return `untitled-${Date.now().toString(36)}`;
  }

  const excludeOptions = {
    ...buildExcludeOptions(contentType, existingId),
    contentType,
  };

  for (const candidate of buildSlugDisambiguationCandidates(
    baseSlug,
    options
  )) {
    if (await isSlugAvailable(creatorProfileId, candidate, excludeOptions)) {
      return candidate;
    }
  }

  // Still ambiguous (identical title, date and credits): letters-only suffix,
  // never numeric.
  for (let attempt = 0; attempt < 8; attempt++) {
    const word = crypto
      .randomUUID()
      .replaceAll(/[^a-f]/g, '')
      .padEnd(5, 'x')
      .slice(0, 5);
    const candidate = `${baseSlug}-${word}`;
    if (await isSlugAvailable(creatorProfileId, candidate, excludeOptions)) {
      return candidate;
    }
  }
  return `${baseSlug}-${crypto
    .randomUUID()
    .replaceAll(/[^a-f]/g, 'x')
    .slice(0, 8)}`;
}

/**
 * Look up content by slug for a creator.
 * Returns the content type and ID if found.
 */
export async function findContentBySlug(
  creatorProfileId: string,
  slug: string
): Promise<{ type: ContentType; id: string } | null> {
  // Check releases first
  const [release] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.slug, slug)
      )
    )
    .limit(1);

  if (release) {
    return { type: 'release', id: release.id };
  }

  // Check recordings (new model)
  const [recording] = await db
    .select({ id: discogRecordings.id })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.creatorProfileId, creatorProfileId),
        eq(discogRecordings.slug, slug)
      )
    )
    .limit(1);

  if (recording) {
    return { type: 'release_track', id: recording.id };
  }

  // Check legacy tracks
  const [track] = await db
    .select({ id: discogTracks.id })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.creatorProfileId, creatorProfileId),
        eq(discogTracks.slug, slug)
      )
    )
    .limit(1);

  if (track) {
    return { type: 'track', id: track.id };
  }

  return null;
}

/**
 * Resolve a superseded base slug to the artist's one published release.
 *
 * Import-time collisions suffix later releases (`take-me-over` becomes
 * `take-me-over-2`) while links already published elsewhere keep the base
 * slug. Identity cannot be known generically, so this is deliberately
 * conservative. It returns a slug only when ALL hold:
 *  - no non-deleted release of the creator owns `baseSlug` (a placeholder or
 *    draft owner means the slug is claimed; never shadow it);
 *  - exactly ONE publish-eligible release has slug `{baseSlug}-N`;
 *  - that release's title normalizes to exactly `baseSlug` (so remixes and
 *    differently-titled versions never match).
 * Two or more candidates are ambiguous (could be different recordings), so no
 * redirect is made.
 */
export async function findSupersededReleaseSlug(
  creatorProfileId: string,
  baseSlug: string
): Promise<{ readonly currentSlug: string } | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(baseSlug)) return null;

  const [owner, siblings] = await Promise.all([
    db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          eq(discogReleases.slug, baseSlug),
          isNull(discogReleases.deletedAt)
        )
      )
      .limit(1),
    db
      .select({ slug: discogReleases.slug, title: discogReleases.title })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          like(discogReleases.slug, `${baseSlug}-%`),
          publicReleaseEligibilitySqlPredicate()
        )
      )
      .limit(20),
  ]);
  if (owner.length > 0) return null;

  const suffixed = new RegExp(`^${baseSlug}-\\d+$`);
  const candidates = siblings.filter(
    row => suffixed.test(row.slug) && generateBaseSlug(row.title) === baseSlug
  );
  const [only] = candidates;
  return candidates.length === 1 && only ? { currentSlug: only.slug } : null;
}

/**
 * Look up redirect by old slug.
 * Returns the current slug if a redirect exists.
 */
export async function findRedirectByOldSlug(
  creatorProfileId: string,
  oldSlug: string,
  options: {
    readonly onError?: 'return-null' | 'throw';
    /**
     * Also resolve a base slug superseded by a collision-suffixed sibling
     * (see `findSupersededReleaseSlug`). Defaults to true for the public
     * content route; legacy profile-mode alias checks opt out so a mode alias
     * is never captured by a release.
     */
    readonly includeSuperseded?: boolean;
  } = {}
): Promise<{ type: ContentType; currentSlug: string } | null> {
  try {
    const [redirect] = await withRetry(
      () =>
        db
          .select({
            contentType: contentSlugRedirects.contentType,
            releaseId: contentSlugRedirects.releaseId,
            trackId: contentSlugRedirects.trackId,
            releaseTrackId: contentSlugRedirects.releaseTrackId,
          })
          .from(contentSlugRedirects)
          .where(
            and(
              eq(contentSlugRedirects.creatorProfileId, creatorProfileId),
              eq(contentSlugRedirects.oldSlug, oldSlug)
            )
          )
          .limit(1),
      `findRedirectByOldSlug(${creatorProfileId}:${oldSlug})`,
      { operation: 'read', retryBudgetMs: QUERY_TIMEOUTS.api }
    );

    if (!redirect) {
      if (options.includeSuperseded === false) return null;
      const superseded = await findSupersededReleaseSlug(
        creatorProfileId,
        oldSlug
      );
      return superseded
        ? { type: 'release', currentSlug: superseded.currentSlug }
        : null;
    }

    return await resolveRedirectSlug(redirect);
  } catch (error) {
    logger.error(
      'Failed to resolve redirect for smart-link slug',
      {
        creatorProfileId,
        error,
        helper: 'findRedirectByOldSlug',
        oldSlug,
      },
      'public-smart-link'
    );
    if (options.onError === 'throw') throw error;
    return null;
  }
}

/** Resolve the current slug for a redirect entry based on its content type. */
async function resolveRedirectSlug(redirect: {
  contentType: string;
  releaseId: string | null;
  trackId: string | null;
  releaseTrackId: string | null;
}): Promise<{ type: ContentType; currentSlug: string } | null> {
  if (redirect.contentType === 'release' && redirect.releaseId) {
    const [release] = await db
      .select({ slug: discogReleases.slug })
      .from(discogReleases)
      .where(eq(discogReleases.id, redirect.releaseId))
      .limit(1);

    return release
      ? { type: 'release' as const, currentSlug: release.slug }
      : null;
  }

  if (redirect.contentType === 'release_track' && redirect.releaseTrackId) {
    const [rt] = await db
      .select({ recordingId: discogReleaseTracks.recordingId })
      .from(discogReleaseTracks)
      .where(eq(discogReleaseTracks.id, redirect.releaseTrackId))
      .limit(1);

    if (!rt) return null;

    const [recording] = await db
      .select({ slug: discogRecordings.slug })
      .from(discogRecordings)
      .where(eq(discogRecordings.id, rt.recordingId))
      .limit(1);

    return recording
      ? { type: 'release_track' as const, currentSlug: recording.slug }
      : null;
  }

  if (redirect.contentType === 'track' && redirect.trackId) {
    const [track] = await db
      .select({ slug: discogTracks.slug })
      .from(discogTracks)
      .where(eq(discogTracks.id, redirect.trackId))
      .limit(1);

    return track ? { type: 'track' as const, currentSlug: track.slug } : null;
  }

  return null;
}

/**
 * Create a redirect entry when a slug is changed.
 * This preserves old URLs by redirecting to the new slug.
 */
export async function createSlugRedirect(params: {
  creatorProfileId: string;
  oldSlug: string;
  contentType: ContentType;
  contentId: string;
}): Promise<void> {
  const { creatorProfileId, oldSlug, contentType, contentId } = params;

  await db
    .insert(contentSlugRedirects)
    .values({
      creatorProfileId,
      oldSlug,
      contentType,
      releaseId: contentType === 'release' ? contentId : null,
      trackId: contentType === 'track' ? contentId : null,
      releaseTrackId: contentType === 'release_track' ? contentId : null,
    })
    .onConflictDoNothing(); // Ignore if redirect already exists
}

/**
 * Update a content slug and create a redirect for the old one.
 * Returns the new slug (may be modified if there was a collision).
 */
export async function updateSlugWithRedirect(params: {
  creatorProfileId: string;
  contentType: ContentType;
  contentId: string;
  currentSlug: string;
  newSlug: string;
}): Promise<string> {
  const { creatorProfileId, contentType, contentId, currentSlug, newSlug } =
    params;

  // Sanitize and validate the new slug
  const sanitizedSlug = generateBaseSlug(newSlug);
  if (!sanitizedSlug) {
    throw new Error(
      'Invalid slug: must contain at least one alphanumeric character'
    );
  }

  // Don't do anything if slug hasn't changed
  if (sanitizedSlug === currentSlug) {
    return currentSlug;
  }

  // Check if the new slug is available
  const excludeOptions = {
    ...buildExcludeOptions(contentType, contentId),
    contentType,
  };

  const available = await isSlugAvailable(
    creatorProfileId,
    sanitizedSlug,
    excludeOptions
  );

  if (!available) {
    throw new Error(`Slug "${sanitizedSlug}" is already in use`);
  }

  // Create redirect + update slug
  // The neon-http driver does not support transactions
  // Execute operations directly without ACID guarantees
  await db
    .insert(contentSlugRedirects)
    .values({
      creatorProfileId,
      oldSlug: currentSlug,
      contentType,
      releaseId: contentType === 'release' ? contentId : null,
      trackId: contentType === 'track' ? contentId : null,
      releaseTrackId: contentType === 'release_track' ? contentId : null,
    })
    .onConflictDoNothing(); // Ignore if redirect already exists

  if (contentType === 'release') {
    await db
      .update(discogReleases)
      .set({ slug: sanitizedSlug, updatedAt: new Date() })
      .where(eq(discogReleases.id, contentId));
  } else if (contentType === 'release_track') {
    await db
      .update(discogRecordings)
      .set({ slug: sanitizedSlug, updatedAt: new Date() })
      .where(eq(discogRecordings.id, contentId));
  } else {
    await db
      .update(discogTracks)
      .set({ slug: sanitizedSlug, updatedAt: new Date() })
      .where(eq(discogTracks.id, contentId));
  }

  return sanitizedSlug;
}
