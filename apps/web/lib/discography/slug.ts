/**
 * Content Slug Generation and Validation
 *
 * Generates clean, URL-friendly slugs for releases and tracks.
 * Ensures uniqueness across both content types per creator.
 */

import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  contentSlugRedirects,
  discogReleases,
  discogTracks,
} from '@/lib/db/schema';

export type ContentType = 'release' | 'track';

/**
 * Generate a URL-safe slug from a title.
 * No longer appends Spotify ID suffix - uses collision numbering instead.
 */
export function generateBaseSlug(
  title: string,
  maxLength: number = 50
): string {
  return (
    title
      .toLowerCase()
      // Normalize unicode characters (é → e, ñ → n, etc.)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove special characters except spaces and hyphens
      .replace(/[^a-z0-9\s-]/g, '')
      // Replace spaces with hyphens
      .replace(/\s+/g, '-')
      // Collapse multiple hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/(^-)|(-$)/g, '')
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
  }
): Promise<boolean> {
  const { excludeReleaseId, excludeTrackId } = options ?? {};

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

  // Check tracks
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

/**
 * Generate a unique slug for content, handling collisions with -2, -3, etc.
 */
export async function generateUniqueSlug(
  creatorProfileId: string,
  title: string,
  contentType: ContentType,
  existingId?: string
): Promise<string> {
  const baseSlug = generateBaseSlug(title);

  // Handle empty slug edge case
  if (!baseSlug) {
    const fallbackSlug = `untitled-${Date.now().toString(36)}`;
    return fallbackSlug;
  }

  const excludeOptions =
    contentType === 'release'
      ? { excludeReleaseId: existingId }
      : { excludeTrackId: existingId };

  // Try the base slug first
  if (await isSlugAvailable(creatorProfileId, baseSlug, excludeOptions)) {
    return baseSlug;
  }

  // Try with numeric suffixes
  for (let i = 2; i <= 100; i++) {
    const numberedSlug = `${baseSlug}-${i}`;
    if (await isSlugAvailable(creatorProfileId, numberedSlug, excludeOptions)) {
      return numberedSlug;
    }
  }

  // Fallback: append random suffix (extremely rare edge case)
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${baseSlug}-${randomSuffix}`;
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

  // Check tracks
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
 * Look up redirect by old slug.
 * Returns the current slug if a redirect exists.
 */
export async function findRedirectByOldSlug(
  creatorProfileId: string,
  oldSlug: string
): Promise<{ type: ContentType; currentSlug: string } | null> {
  const [redirect] = await db
    .select({
      contentType: contentSlugRedirects.contentType,
      releaseId: contentSlugRedirects.releaseId,
      trackId: contentSlugRedirects.trackId,
    })
    .from(contentSlugRedirects)
    .where(
      and(
        eq(contentSlugRedirects.creatorProfileId, creatorProfileId),
        eq(contentSlugRedirects.oldSlug, oldSlug)
      )
    )
    .limit(1);

  if (!redirect) return null;

  // Get current slug based on content type
  if (redirect.contentType === 'release' && redirect.releaseId) {
    const [release] = await db
      .select({ slug: discogReleases.slug })
      .from(discogReleases)
      .where(eq(discogReleases.id, redirect.releaseId))
      .limit(1);

    if (release) {
      return { type: 'release', currentSlug: release.slug };
    }
  } else if (redirect.contentType === 'track' && redirect.trackId) {
    const [track] = await db
      .select({ slug: discogTracks.slug })
      .from(discogTracks)
      .where(eq(discogTracks.id, redirect.trackId))
      .limit(1);

    if (track) {
      return { type: 'track', currentSlug: track.slug };
    }
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
  const excludeOptions =
    contentType === 'release'
      ? { excludeReleaseId: contentId }
      : { excludeTrackId: contentId };

  const available = await isSlugAvailable(
    creatorProfileId,
    sanitizedSlug,
    excludeOptions
  );

  if (!available) {
    throw new Error(`Slug "${sanitizedSlug}" is already in use`);
  }

  // Create redirect + update slug atomically to avoid partial state.
  return await db.transaction(async tx => {
    await tx
      .insert(contentSlugRedirects)
      .values({
        creatorProfileId,
        oldSlug: currentSlug,
        contentType,
        releaseId: contentType === 'release' ? contentId : null,
        trackId: contentType === 'track' ? contentId : null,
      })
      .onConflictDoNothing(); // Ignore if redirect already exists

    if (contentType === 'release') {
      await tx
        .update(discogReleases)
        .set({ slug: sanitizedSlug, updatedAt: new Date() })
        .where(eq(discogReleases.id, contentId));
    } else {
      await tx
        .update(discogTracks)
        .set({ slug: sanitizedSlug, updatedAt: new Date() })
        .where(eq(discogTracks.id, contentId));
    }

    return sanitizedSlug;
  });
}
