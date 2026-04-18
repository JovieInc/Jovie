'use server';

import { and, eq } from 'drizzle-orm';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { groupReleaseCredits } from '@/app/[username]/[slug]/_lib/data';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { getOptionalAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import {
  artists,
  discogReleases,
  releaseArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export async function fetchReleaseCreditsAction(
  releaseId: string
): Promise<SmartLinkCreditGroup[]> {
  const { userId } = await getOptionalAuth();
  if (!userId) {
    return [];
  }

  const dashboardData = await getDashboardData();
  const selectedProfile = dashboardData.selectedProfile;

  if (!selectedProfile) {
    return [];
  }

  if (selectedProfile.userId !== userId) {
    return [];
  }

  const [release] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, selectedProfile.id)
      )
    )
    .limit(1);

  if (!release) {
    return [];
  }

  const rows = await db
    .select({
      artistId: artists.id,
      artistName: artists.name,
      creditName: releaseArtists.creditName,
      handle: creatorProfiles.usernameNormalized,
      role: releaseArtists.role,
      position: releaseArtists.position,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .leftJoin(creatorProfiles, eq(artists.creatorProfileId, creatorProfiles.id))
    .where(eq(releaseArtists.releaseId, releaseId))
    .orderBy(releaseArtists.position);

  return groupReleaseCredits(rows);
}
