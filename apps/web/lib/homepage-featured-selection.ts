import { and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { FOUNDER_DEMO_PERSONA } from '@/lib/demo-personas';
import { captureError } from '@/lib/error-tracking';
import {
  type FeaturedCreator,
  getCreatorByHandle,
  getFeaturedCreators,
} from '@/lib/featured-creators';
import { transformImageUrl } from '@/lib/images/versioning';

export interface HomepageFeaturedSelectionOptions {
  readonly pinnedHandle?: string;
  readonly limit?: number;
  readonly includeClaimedFeaturedCandidates?: boolean;
}

export interface HomepageFeaturedSelectionResult {
  readonly pinnedCreator: FeaturedCreator;
  readonly creators: FeaturedCreator[];
  readonly claimedFeaturedCandidates: HomepageFeaturedCandidate[];
}

export interface HomepageFeaturedCandidate extends FeaturedCreator {
  readonly isClaimed: boolean;
  readonly spotifyPopularity: number | null;
  readonly fitScore: number | null;
}

const DEFAULT_PINNED_HANDLE = 'tim';
const DEFAULT_LIMIT = 3;

function buildFounderFallbackCreator(): FeaturedCreator {
  return {
    id: 'homepage-founder-fallback',
    handle: FOUNDER_DEMO_PERSONA.profile.handle,
    name: FOUNDER_DEMO_PERSONA.profile.displayName,
    src: FOUNDER_DEMO_PERSONA.profile.avatarSrc,
    tagline: FOUNDER_DEMO_PERSONA.profile.bio,
    genres: [...FOUNDER_DEMO_PERSONA.profile.genres],
    latestReleaseTitle: null,
    latestReleaseType: null,
  };
}

async function queryHomepageFeaturedCandidates(): Promise<
  HomepageFeaturedCandidate[]
> {
  try {
    if (!(await doesTableExist(TABLE_NAMES.creatorProfiles))) {
      return [];
    }

    const rows = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        bio: creatorProfiles.bio,
        avatarUrl: creatorProfiles.avatarUrl,
        genres: creatorProfiles.genres,
        isClaimed: creatorProfiles.isClaimed,
        spotifyPopularity: creatorProfiles.spotifyPopularity,
        fitScore: creatorProfiles.fitScore,
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
      .limit(50);

    return rows.map(row => ({
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
      latestReleaseTitle: null,
      latestReleaseType: null,
      isClaimed: Boolean(row.isClaimed),
      spotifyPopularity: row.spotifyPopularity ?? null,
      fitScore: row.fitScore ?? null,
    }));
  } catch (error) {
    captureError('[HomepageFeaturedSelection] Candidate query failed', error, {
      context: 'homepage_featured_candidates',
    });
    return [];
  }
}

export const getHomepageFeaturedCandidates = unstable_cache(
  queryHomepageFeaturedCandidates,
  ['homepage-featured-candidates'],
  {
    revalidate: 60 * 60,
    tags: ['featured-creators'],
  }
);

export function filterClaimedFeaturedCandidates(
  candidates: readonly HomepageFeaturedCandidate[]
): HomepageFeaturedCandidate[] {
  return candidates.filter(candidate => candidate.isClaimed);
}

export async function resolveHomepagePinnedCreator(
  options: HomepageFeaturedSelectionOptions = {}
): Promise<FeaturedCreator> {
  const handle = options.pinnedHandle ?? DEFAULT_PINNED_HANDLE;
  return (await getCreatorByHandle(handle)) ?? buildFounderFallbackCreator();
}

export async function resolveHomepageFeaturedCreators(
  options: HomepageFeaturedSelectionOptions = {}
): Promise<HomepageFeaturedSelectionResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const includeClaimedFeaturedCandidates =
    options.includeClaimedFeaturedCandidates ?? false;
  const [pinnedCreator, featuredCreators, homepageCandidates] =
    await Promise.all([
      resolveHomepagePinnedCreator(options),
      getFeaturedCreators(),
      includeClaimedFeaturedCandidates
        ? getHomepageFeaturedCandidates()
        : Promise.resolve([]),
    ]);

  const otherCreators = featuredCreators.filter(
    creator => creator.handle !== pinnedCreator.handle
  );

  return {
    pinnedCreator,
    creators: [pinnedCreator, ...otherCreators].slice(0, limit),
    claimedFeaturedCandidates:
      filterClaimedFeaturedCandidates(homepageCandidates),
  };
}
