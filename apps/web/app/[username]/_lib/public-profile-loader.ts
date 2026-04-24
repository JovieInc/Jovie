import 'server-only';

import { unstable_cache } from 'next/cache';
import { cache } from 'react';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for the contact type alias
import type { CreatorContact as DbCreatorContact } from '@/lib/db/schema';
import type { DiscogRelease } from '@/lib/db/schema/content';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { isDspPlatform } from '@/lib/services/social-links/types';
import { toISOStringSafe } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import type { CreatorProfile, LegacySocialLink } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { mapProfileWithLinksToCreatorProfile } from './profile-mapper';
import { shouldBypassPublicProfileQaCache } from './public-profile-qa';

/**
 * Shape returned to every consumer of the public profile loader. Stable
 * across both the base profile route and per-mode routes (plan PR 3a-2b
 * and following).
 */
export interface PublicProfileLoaderResult {
  readonly profile: CreatorProfile | null;
  readonly links: LegacySocialLink[];
  readonly contacts: DbCreatorContact[];
  readonly creatorIsPro: boolean;
  readonly creatorClerkId: string | null;
  readonly genres: string[] | null;
  readonly latestRelease: DiscogRelease | null;
  readonly pressPhotos: PressPhoto[];
  readonly status: 'ok' | 'not_found' | 'error';
}

function calculateProfileCompletion(result: {
  displayName?: string | null;
  avatarUrl?: string | null;
  userEmail?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  socialLinks?: Array<{
    platform?: string | null;
    platformType?: string | null;
  }> | null;
}): number {
  const hasMusicLinks =
    Boolean(result.spotifyUrl || result.appleMusicUrl || result.youtubeUrl) ||
    Boolean(
      result.socialLinks?.some(link => {
        const platform = link.platform?.toLowerCase();
        return (
          link.platformType === 'dsp' ||
          (typeof platform === 'string' && isDspPlatform(platform))
        );
      })
    );

  return calculateRequiredProfileCompletion({
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    email: result.userEmail,
    hasMusicLinks,
  }).percentage;
}

/** Fetches profile and social links in a single database call. */
const fetchProfileAndLinks = async (
  username: string
): Promise<PublicProfileLoaderResult> => {
  try {
    // The page-level unstable_cache is the canonical cache for public profile
    // rendering. Bypass the profile service's Redis layer here because its
    // Upstash fetch is `no-store`, which turns uncached ISR handles into
    // static-to-dynamic runtime errors in production.
    const result = await getCreatorProfileWithLinks(username, {
      skipCache: true,
    });

    // Use truthy check (not strict equality) for isPublic because the neon-http
    // driver may return boolean columns as non-boolean truthy values (e.g., 1, "t")
    // in edge cases — same class of issue as dates-as-strings (see JOVIE-WEB-6X).
    if (!result?.isPublic) {
      // Expected 404 — profile not found or not public. No Sentry capture needed;
      // these are normal from typos, crawlers, and enumeration traffic (JOV-1321).
      return {
        profile: null,
        links: [],
        contacts: [],
        creatorIsPro: false,
        creatorClerkId: null,
        genres: null,
        latestRelease: null,
        pressPhotos: [],
        status: 'not_found',
      };
    }

    const creatorIsPro = Boolean(result.userIsPro);
    const creatorClerkId =
      typeof result.userClerkId === 'string' ? result.userClerkId : null;

    const profile = mapProfileWithLinksToCreatorProfile(result, {
      profileCompletionPct: calculateProfileCompletion(result),
    });

    const links: LegacySocialLink[] =
      result.socialLinks?.map(link => ({
        id: link.id,
        artist_id: result.id,
        platform: (link.platform ?? '').toLowerCase(),
        url: link.url,
        clicks: link.clicks || 0,
        created_at: toISOStringSafe(link.createdAt),
      })) ?? [];

    // If the artist has a venmoHandle on their profile but no venmo social link,
    // inject a synthetic venmo link so tipping works on the public profile page.
    const hasVenmoSocialLink = links.some(l => l.platform === 'venmo');
    if (!hasVenmoSocialLink && result.venmoHandle) {
      const handle = result.venmoHandle.replace(/^@/, '');
      links.push({
        id: `venmo-${result.id}`,
        artist_id: result.id,
        platform: 'venmo',
        url: `https://venmo.com/${encodeURIComponent(handle)}`,
        clicks: 0,
        created_at: toISOStringSafe(result.createdAt),
      });
    }

    const contacts: DbCreatorContact[] = result.contacts ?? [];
    const latestRelease = result.latestRelease ?? null;

    return {
      profile,
      links,
      contacts,
      creatorIsPro,
      creatorClerkId,
      genres: result.genres ?? null,
      latestRelease,
      pressPhotos: result.pressPhotos ?? [],
      status: 'ok',
    };
  } catch (error) {
    logger.error(
      'Error fetching creator profile',
      {
        error,
        route: '/[username]',
        username,
      },
      'public-profile'
    );
    return {
      profile: null,
      links: [],
      contacts: [],
      creatorIsPro: false,
      creatorClerkId: null,
      genres: null,
      latestRelease: null,
      pressPhotos: [],
      status: 'error',
    };
  }
};

const PROFILE_SUCCESS_CACHE_TTL_SECONDS = 3600; // 1 hour

class NonCacheableProfileResultError extends Error {
  readonly result: PublicProfileLoaderResult;

  constructor(result: PublicProfileLoaderResult) {
    super(`Profile fetch returned non-cacheable status: ${result.status}`);
    this.name = 'NonCacheableProfileResultError';
    this.result = result;
  }
}

/**
 * Cached profile fetcher. Only caches successful (status: 'ok') results.
 *
 * IMPORTANT: We intentionally do NOT use a negative cache (caching not_found
 * results). The previous negative cache pattern used thrown errors to signal
 * "don't cache this" to unstable_cache, but unstable_cache treats background
 * revalidation failures by serving the stale value — causing not_found
 * results to become permanently sticky even after the profile becomes
 * available.
 *
 * Instead, not_found and error results are always fetched fresh.
 */
const getCachedProfileAndLinks = async (
  username: string
): Promise<PublicProfileLoaderResult> => {
  // Skip Next.js cache in test/development environments
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    shouldBypassPublicProfileQaCache()
  ) {
    return fetchProfileAndLinks(username);
  }

  // Single fetch path via unstable_cache. The cached function is the sole
  // fetch path, eliminating the previous double-fetch on first visit.
  try {
    const cachedFetch = unstable_cache(
      async () => {
        const data = await fetchProfileAndLinks(username);
        if (data.status !== 'ok') {
          // Don't cache not_found or error results — throw to prevent
          // stale success from being served on background revalidation.
          // Carry the original payload through the throw path so callers
          // do not need to re-read storage just to render a fresh non-ok
          // response.
          throw new NonCacheableProfileResultError(data);
        }
        return data;
      },
      [`public-profile-${username}`],
      {
        tags: ['profiles-all', `profile:${username}`],
        revalidate: PROFILE_SUCCESS_CACHE_TTL_SECONDS,
      }
    );
    return await cachedFetch();
  } catch (error) {
    if (error instanceof NonCacheableProfileResultError) {
      return error.result;
    }

    // Cache layer failure — fetch fresh
    return fetchProfileAndLinks(username);
  }
};

/**
 * Per-request memoized profile fetcher. Use this from server components and
 * `generateMetadata` so duplicate calls within the same request hit React's
 * `cache()` instead of the database.
 *
 * The username is normalized to lowercase here so callers don't have to.
 */
export const getProfileAndLinks = cache(
  async (username: string): Promise<PublicProfileLoaderResult> => {
    return getCachedProfileAndLinks(username.toLowerCase());
  }
);
