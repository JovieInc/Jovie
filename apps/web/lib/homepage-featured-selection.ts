import { and, eq } from 'drizzle-orm';
import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  type FeaturedCreator,
  getCreatorByHandle,
  getFeaturedCreators,
} from '@/lib/featured-creators';
import { transformImageUrl } from '@/lib/images/versioning';
import { filterPublicDiscoveryIdentities } from '@/lib/profile/public-profile-indexing-policy';

export interface HomepageFeaturedSelectionOptions {
  readonly pinnedHandle?: string;
  readonly limit?: number;
  readonly includeClaimedFeaturedCandidates?: boolean;
}

export interface HomepageFeaturedSelectionResult {
  readonly pinnedCreator: FeaturedCreator | null;
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
        settings: creatorProfiles.settings,
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

    return filterPublicDiscoveryIdentities(
      rows.map(row => ({
        ...row,
        handle: row.username,
        isPublic: true,
      }))
    ).map(row => ({
      id: row.id,
      handle: row.username,
      name: row.displayName || row.username,
      src: transformImageUrl(row.avatarUrl || '/avatars/default-user.png', {
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

export const getHomepageFeaturedCandidates = queryHomepageFeaturedCandidates;

export function filterClaimedFeaturedCandidates(
  candidates: readonly HomepageFeaturedCandidate[]
): HomepageFeaturedCandidate[] {
  return candidates.filter(candidate => candidate.isClaimed);
}

export async function resolveHomepagePinnedCreator(
  options: HomepageFeaturedSelectionOptions = {}
): Promise<FeaturedCreator | null> {
  const handle = options.pinnedHandle ?? DEFAULT_PINNED_HANDLE;
  // Missing, unavailable, and withdrawn profiles must not be resurrected by a
  // static identity fallback in an automatic discovery list.
  return getCreatorByHandle(handle);
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
    creator => creator.handle !== pinnedCreator?.handle
  );

  return {
    pinnedCreator,
    creators: [
      ...(pinnedCreator ? [pinnedCreator] : []),
      ...otherCreators,
    ].slice(0, limit),
    claimedFeaturedCandidates:
      filterClaimedFeaturedCandidates(homepageCandidates),
  };
}
