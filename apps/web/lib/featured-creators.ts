import { and, eq } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { transformImageUrl } from '@/lib/images/versioning';

export type FeaturedCreator = {
  id: string;
  handle: string;
  name: string;
  src: string;
  tagline: string | null;
  genres: string[];
  latestReleaseTitle: string | null;
  latestReleaseType: string | null;
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

export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T,
  onTimeout: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>(resolve => {
    timeoutId = setTimeout(() => {
      onTimeout();
      resolve(fallbackValue);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

async function queryFeaturedCreators(): Promise<FeaturedCreator[]> {
  try {
    // Add timeout to table existence check (15s) to prevent false negatives during cold starts
    const tableExists = await withTimeoutFallback(
      doesTableExist(TABLE_NAMES.creatorProfiles),
      15000,
      false,
      () => {
        captureWarning(
          '[FeaturedCreators] Table check timed out after 15s, assuming table does not exist'
        );
      }
    );

    if (!tableExists) {
      captureWarning(
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
          bio: creatorProfiles.bio,
          avatarUrl: creatorProfiles.avatarUrl,
          creatorType: creatorProfiles.creatorType,
          genres: creatorProfiles.genres,
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

    const creatorIds = data.map(creator => creator.id);
    const releaseByCreatorId = new Map<
      string,
      { title: string; type: string | null }
    >();

    if (creatorIds.length > 0 && (await doesTableExist('discog_releases'))) {
      const latestReleases = await Promise.race([
        db.query.discogReleases.findMany({
          where: (releases, { inArray }) =>
            inArray(releases.creatorProfileId, creatorIds),
          columns: {
            creatorProfileId: true,
            title: true,
            releaseType: true,
            releaseDate: true,
            createdAt: true,
          },
          orderBy: (releases, { desc }) => [
            desc(releases.releaseDate),
            desc(releases.createdAt),
          ],
          limit: 100,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Discog releases query timeout after 10s')),
            10000
          )
        ),
      ]);

      for (const release of latestReleases) {
        if (!releaseByCreatorId.has(release.creatorProfileId)) {
          releaseByCreatorId.set(release.creatorProfileId, {
            title: release.title,
            type: release.releaseType,
          });
        }
      }
    }

    const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
    return shuffle(
      data.map(a => {
        const latestRelease = releaseByCreatorId.get(a.id);

        return {
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
          tagline: a.bio,
          genres: a.genres?.slice(0, 2) ?? [],
          latestReleaseTitle: latestRelease?.title ?? null,
          latestReleaseType: latestRelease?.type ?? null,
        };
      }),
      seed
    );
  } catch (error) {
    // Log error but don't throw - use fallbacks in component
    captureError('[FeaturedCreators] Query failed', error, {
      context: 'featured_creators_query',
      message:
        'Failed to fetch featured creators, component will use fallback avatars',
    });

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
 * Fetch a single creator by handle for pinned profile display.
 * Returns null if the profile doesn't exist or isn't public.
 */
async function queryCreatorByHandle(
  handle: string
): Promise<FeaturedCreator | null> {
  try {
    const tableExists = await withTimeoutFallback(
      doesTableExist(TABLE_NAMES.creatorProfiles),
      15000,
      false,
      () => {
        captureWarning(
          '[FeaturedCreators] Table check timed out in queryCreatorByHandle'
        );
      }
    );

    if (!tableExists) return null;

    const [row] = await Promise.race([
      db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          bio: creatorProfiles.bio,
          avatarUrl: creatorProfiles.avatarUrl,
          genres: creatorProfiles.genres,
        })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.username, handle),
            eq(creatorProfiles.isPublic, true)
          )
        )
        .limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Creator by handle query timeout after 10s')),
          10000
        )
      ),
    ]);

    if (!row) return null;

    let latestReleaseTitle: string | null = null;
    let latestReleaseType: string | null = null;

    if (await doesTableExist('discog_releases')) {
      const releases = await db.query.discogReleases.findMany({
        where: (releases, { eq: releaseEq }) =>
          releaseEq(releases.creatorProfileId, row.id),
        columns: { title: true, releaseType: true, releaseDate: true },
        orderBy: (releases, { desc }) => [desc(releases.releaseDate)],
        limit: 1,
      });

      if (releases[0]) {
        latestReleaseTitle = releases[0].title;
        latestReleaseType = releases[0].releaseType;
      }
    }

    return {
      id: row.id,
      handle: row.username,
      name: row.displayName || row.username,
      src: transformImageUrl(row.avatarUrl || '/android-chrome-192x192.png', {
        width: 256,
        height: 256,
        quality: 70,
        format: 'webp',
        crop: 'fill',
        gravity: 'face',
      }),
      tagline: row.bio,
      genres: row.genres?.slice(0, 2) ?? [],
      latestReleaseTitle,
      latestReleaseType,
    };
  } catch (error) {
    captureError('[FeaturedCreators] queryCreatorByHandle failed', error, {
      context: 'creator_by_handle_query',
      handle,
    });
    return null;
  }
}

export const getCreatorByHandle = unstable_cache(
  queryCreatorByHandle,
  ['creator-by-handle'],
  {
    revalidate: 60 * 60 * 24,
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
    )
    .limit(200);

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
    captureError('[FeaturedCreators] Failed to invalidate cache', error);
    // Fail silently - cache will eventually expire on its own
  }
}
