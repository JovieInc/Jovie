import { and, count, sql as drizzleSql, eq } from 'drizzle-orm';
import { readAuthorizedProfileViews } from '@/lib/analytics/authorized-read';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { resolveHasMusicLinks } from '@/lib/chat/music-link-presence';
import { countVisibleReleaseListenLinks } from '@/lib/chat/release-listen-links';
import type { ArtistContext } from '@/lib/chat/types';
import { db } from '@/lib/db';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlAny } from '@/lib/db/sql-helpers';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { logger } from '@/lib/utils/logger';

/**
 * Fetches artist context server-side from the database.
 * Validates that the authenticated user can manage the profile.
 */
export async function fetchArtistContext(
  profileId: string,
  appUserId: string
): Promise<ArtistContext | null> {
  const access = await getExactProfileAccess(db, appUserId, profileId);
  if (!access.ok) {
    return null;
  }

  const [result] = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!result) {
    return null;
  }

  // Fetch link counts and tipping stats in parallel
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthISO = startOfMonth.toISOString();

  // Release listen links render on the public profile too.
  const releaseListenCount = countVisibleReleaseListenLinks(profileId);
  const [linkCounts, tipTotals, clickStats, profileViews] = await Promise.all([
    db
      .select({
        totalActive: count(),
        musicActive: drizzleSql<number>`count(*) filter (where ${socialLinks.platformType} = 'dsp' OR ${socialLinks.platform} = ${sqlAny(DSP_PLATFORMS)})`,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.state, 'active')
        )
      )
      .then(r => r[0]),
    db
      .select({
        totalReceived: drizzleSql<number>`COALESCE(SUM(${tips.amountCents}), 0)`,
        monthReceived: drizzleSql<number>`COALESCE(SUM(CASE WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp THEN ${tips.amountCents} ELSE 0 END), 0)`,
        tipsSubmitted: drizzleSql<number>`COALESCE(COUNT(${tips.id}), 0)`,
      })
      .from(tips)
      .where(eq(tips.creatorProfileId, profileId))
      .then(r => r[0]),
    db
      .select({
        total: drizzleSql<number>`count(*)`,
      })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, profileId),
          eq(clickEvents.linkType, 'tip')
        )
      )
      .then(r => r[0]),
    readAuthorizedProfileViews(appUserId).catch(error => {
      logger.warn('Authorized analytics unavailable for chat context', {
        profileId,
        error,
      });
      return 0;
    }),
  ]);

  return {
    displayName: result.displayName ?? result.username,
    username: result.username,
    bio: result.bio,
    genres: result.genres ?? [],
    spotifyFollowers: result.spotifyFollowers,
    spotifyPopularity: result.spotifyPopularity,
    spotifyUrl: result.spotifyUrl,
    appleMusicUrl: result.appleMusicUrl,
    profileViews,
    hasSocialLinks: Number(linkCounts?.totalActive ?? 0) > 0,
    hasMusicLinks: resolveHasMusicLinks({
      dspSocialLinkCount: Number(linkCounts?.musicActive ?? 0),
      releaseListenLinkCount: await releaseListenCount,
      spotifyUrl: result.spotifyUrl,
      appleMusicUrl: result.appleMusicUrl,
    }),
    tippingStats: {
      tipClicks: Number(clickStats?.total ?? 0),
      tipsSubmitted: Number(tipTotals?.tipsSubmitted ?? 0),
      totalReceivedCents: Number(tipTotals?.totalReceived ?? 0),
      monthReceivedCents: Number(tipTotals?.monthReceived ?? 0),
    },
  };
}
