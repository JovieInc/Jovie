/**
 * Shared Data Access for Smart Link Pages
 *
 * Fetches creator and content data for the /{username}/{slug} routes.
 * Used by both the main smart link page and the /sounds page.
 */

import { and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { db } from '@/lib/db';
import {
  discogReleases,
  discogTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { toISOStringOrNull } from '@/lib/utils/date';

export type ContentType = 'release' | 'track';

export interface ContentData {
  type: ContentType;
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | null;
  providerLinks: Array<{ providerId: string; url: string }>;
  artworkSizes?: Record<string, string> | null;
  releaseType?: string | null;
  totalTracks?: number | null;
  previewUrl?: string | null;
  creator: {
    id: string;
    displayName: string | null;
    username: string;
    usernameNormalized: string;
    avatarUrl: string | null;
  };
}

/**
 * Serialized content data for JSON-safe caching.
 * Dates are stored as ISO strings and rehydrated on read.
 */
export interface CachedContentData {
  type: ContentType;
  id: string;
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  providerLinks: Array<{ providerId: string; url: string }>;
  artworkSizes?: Record<string, string> | null;
  releaseType?: string | null;
  totalTracks?: number | null;
  previewUrl?: string | null;
}

/**
 * Fetch creator by normalized username.
 */
const fetchCreatorByUsername = async (usernameNormalized: string) => {
  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      avatarUrl: creatorProfiles.avatarUrl,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, usernameNormalized))
    .limit(1);

  return creator ?? null;
};

/**
 * Get creator with caching.
 * Uses unstable_cache for cross-request caching with targeted invalidation.
 * Wrapped in React.cache() for per-request deduplication.
 */
export const getCreatorByUsername = cache(
  async (usernameNormalized: string) => {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      return fetchCreatorByUsername(usernameNormalized);
    }

    return unstable_cache(
      () => fetchCreatorByUsername(usernameNormalized),
      [`smartlink-creator-${usernameNormalized}`],
      {
        tags: [
          'smartlink-creator',
          `smartlink-creator:${usernameNormalized}`,
          `public-profile:${usernameNormalized}`,
        ],
        revalidate: 3600,
      }
    )();
  }
);

/**
 * Fetch content (release or track) by creator and slug.
 */
const fetchContentBySlug = async (
  creatorProfileId: string,
  slug: string
): Promise<CachedContentData | null> => {
  // Try release first
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      artworkUrl: discogReleases.artworkUrl,
      releaseDate: discogReleases.releaseDate,
      releaseType: discogReleases.releaseType,
      totalTracks: discogReleases.totalTracks,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.slug, slug)
      )
    )
    .limit(1);

  if (release) {
    const links = await db
      .select({
        providerId: providerLinks.providerId,
        url: providerLinks.url,
      })
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          eq(providerLinks.releaseId, release.id)
        )
      );

    const metadata = release.metadata as Record<string, unknown> | null;
    const artworkSizes =
      (metadata?.artworkSizes as Record<string, string>) ?? null;

    return {
      type: 'release',
      id: release.id,
      title: release.title,
      slug: release.slug,
      artworkUrl: release.artworkUrl,
      releaseDate: toISOStringOrNull(release.releaseDate),
      providerLinks: links,
      artworkSizes,
      releaseType: release.releaseType,
      totalTracks: release.totalTracks,
    };
  }

  // Try track
  const [track] = await db
    .select({
      id: discogTracks.id,
      title: discogTracks.title,
      slug: discogTracks.slug,
      releaseId: discogTracks.releaseId,
      previewUrl: discogTracks.previewUrl,
    })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.creatorProfileId, creatorProfileId),
        eq(discogTracks.slug, slug)
      )
    )
    .limit(1);

  if (track) {
    const [releaseData, links] = await Promise.all([
      db
        .select({
          artworkUrl: discogReleases.artworkUrl,
          releaseDate: discogReleases.releaseDate,
        })
        .from(discogReleases)
        .where(eq(discogReleases.id, track.releaseId))
        .limit(1)
        .then(rows => rows[0]),
      db
        .select({
          providerId: providerLinks.providerId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .where(
          and(
            eq(providerLinks.ownerType, 'track'),
            eq(providerLinks.trackId, track.id)
          )
        ),
    ]);

    return {
      type: 'track',
      id: track.id,
      title: track.title,
      slug: track.slug,
      artworkUrl: releaseData?.artworkUrl ?? null,
      releaseDate: toISOStringOrNull(releaseData?.releaseDate),
      providerLinks: links,
      previewUrl: track.previewUrl,
    };
  }

  return null;
};

/**
 * Rehydrate cached content data — converts ISO date strings back to Date objects.
 */
function rehydrateContent(
  cached: CachedContentData
): Omit<ContentData, 'creator'> {
  return {
    ...cached,
    releaseDate: cached.releaseDate ? new Date(cached.releaseDate) : null,
  };
}

/**
 * Get content with caching.
 */
export const getContentBySlug = cache(
  async (
    creatorProfileId: string,
    slug: string
  ): Promise<Omit<ContentData, 'creator'> | null> => {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      const result = await fetchContentBySlug(creatorProfileId, slug);
      return result ? rehydrateContent(result) : null;
    }

    const cached = await unstable_cache(
      () => fetchContentBySlug(creatorProfileId, slug),
      [`smartlink-content-${creatorProfileId}-${slug}`],
      {
        tags: [
          'smartlink-content',
          `smartlink-content:${creatorProfileId}`,
          `smartlink-content:${creatorProfileId}:${slug}`,
        ],
        revalidate: 300,
      }
    )();

    return cached ? rehydrateContent(cached) : null;
  }
);
