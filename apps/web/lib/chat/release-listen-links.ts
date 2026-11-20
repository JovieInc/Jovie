import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';

/**
 * Listen links on releases a visitor can see on the public profile. Uses the
 * canonical public-release predicate so chat never claims links the page hides.
 */
export async function countVisibleReleaseListenLinks(
  profileId: string
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(providerLinks)
    .innerJoin(discogReleases, eq(providerLinks.releaseId, discogReleases.id))
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        publicReleaseEligibilitySqlPredicate()
      )
    );
  return Number(row?.total ?? 0);
}
