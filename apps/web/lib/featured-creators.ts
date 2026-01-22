import { and, eq } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { transformImageUrl } from '@/lib/images/versioning';

export type FeaturedCreator = {
  id: string;
  handle: string;
  name: string;
  src: string;
};

/**
 * VIP artist data for search prioritization.
 * Used to boost featured creators to the top of search results.
 */
export type VipArtist = {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  followers: number;
  popularity: number;
};

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function queryFeaturedCreators(): Promise<FeaturedCreator[]> {
  try {
    // Add timeout to table existence check (5s) to prevent hanging during cold starts
    const tableExists = await Promise.race([
      doesTableExist(TABLE_NAMES.creatorProfiles),
      new Promise<boolean>(resolve =>
        setTimeout(() => {
          console.warn(
            '[FeaturedCreators] Table check timed out after 5s, assuming table does not exist'
          );
          resolve(false);
        }, 5000)
      ),
    ]);

    if (!tableExists) {
      console.warn(
        '[FeaturedCreators] Table check failed or timed out, using fallbacks'
      );
      return [];
    }

    // Add timeout to database query (10s) to prevent hanging
    const data = await Promise.race([
      db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          avatarUrl: creatorProfiles.avatarUrl,
          creatorType: creatorProfiles.creatorType,
        })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.isPublic, true),
            eq(creatorProfiles.isFeatured, true),
            eq(creatorProfiles.marketingOptOut, false)
          )
        )
        .orderBy(creatorProfiles.displayName)
        .limit(12),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Featured creators query timeout after 10s')),
          10000
        )
      ),
    ]);

    const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
    return shuffle(
      data.map(a => ({
        id: a.id,
        handle: a.username,
        name: a.displayName || a.username,
        src: transformImageUrl(a.avatarUrl || '/android-chrome-192x192.png', {
          width: 256,
          height: 256,
          quality: 70,
          format: 'webp',
          crop: 'fill',
          gravity: 'face',
        }),
      })),
      seed
    );
  } catch (error) {
    // Log error but don't throw - use fallbacks in component
    console.error('[FeaturedCreators] Query failed:', error);

    // Server-side only: Log to Sentry for monitoring
    if (typeof window === 'undefined') {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error, {
          tags: { context: 'featured_creators_query' },
          extra: {
            message:
              'Failed to fetch featured creators, component will use fallback avatars',
          },
        });
      } catch (sentryError) {
        // Sentry logging failed, just continue with console error above
        console.error('[FeaturedCreators] Sentry logging failed:', sentryError);
      }
    }

    // Return empty array - component already has fallback avatars
    return [];
  }
}

export const getFeaturedCreators = unstable_cache(
  queryFeaturedCreators,
  ['featured-creators'],
  {
    revalidate: 60 * 60 * 24, // Reduced from 7 days to 1 day to prevent long cache poisoning
    tags: ['featured-creators'],
  }
);

/**
 * Query featured creators for search VIP prioritization.
 * Returns a Map of normalized display names to VIP artist data.
 * Only includes creators with valid Spotify IDs.
 */
async function queryFeaturedCreatorsForSearch(): Promise<
  Map<string, VipArtist>
> {
  if (!(await doesTableExist(TABLE_NAMES.creatorProfiles))) {
    return new Map();
  }

  const data = await db
    .select({
      spotifyId: creatorProfiles.spotifyId,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        eq(creatorProfiles.isFeatured, true),
        eq(creatorProfiles.marketingOptOut, false)
      )
    );

  const vipMap = new Map<string, VipArtist>();

  for (const creator of data) {
    // Skip creators without Spotify IDs
    if (!creator.spotifyId || !creator.displayName) {
      continue;
    }

    const normalizedName = creator.displayName.toLowerCase().trim();
    vipMap.set(normalizedName, {
      spotifyId: creator.spotifyId,
      name: creator.displayName,
      imageUrl: creator.avatarUrl,
      followers: creator.spotifyFollowers ?? 0,
      popularity: creator.spotifyPopularity ?? 0,
    });
  }

  return vipMap;
}

/**
 * Cached function to get VIP artists for search prioritization.
 * Cache duration: 1 hour (shorter than featured creators since search is more dynamic)
 */
export const getFeaturedCreatorsForSearch = unstable_cache(
  queryFeaturedCreatorsForSearch,
  ['featured-creators-search'],
  {
    revalidate: 60 * 60, // 1 hour
    tags: ['featured-creators'],
  }
);

/**
 * Invalidates the featured creators cache.
 * Useful for forcing a refresh after database errors or updates.
 * Safe to call - fails silently if revalidation fails.
 */
export function invalidateFeaturedCreatorsCache(): void {
  try {
    revalidateTag('featured-creators', 'max');
  } catch (error) {
    console.error('[FeaturedCreators] Failed to invalidate cache:', error);
    // Fail silently - cache will eventually expire on its own
  }
}
