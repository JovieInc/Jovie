import 'server-only';

import { and, count, sql as drizzleSql, eq } from 'drizzle-orm';
import type { ArtistContext } from '@/lib/chat/types';
import { db } from '@/lib/db';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlAny } from '@/lib/db/sql-helpers';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { logger } from '@/lib/utils/logger';

const EMPTY_TIPPING_STATS: ArtistContext['tippingStats'] = {
  tipClicks: 0,
  tipsSubmitted: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
};

export interface AuthorizedArtistIdentity {
  readonly displayName: string | null;
  readonly username: string | null;
}

export function artistContextFromAuthorizedProfile(
  profile: AuthorizedArtistIdentity
): ArtistContext | null {
  const username = profile.username?.trim() ?? '';
  if (username.length === 0) {
    return null;
  }

  return {
    displayName: profile.displayName?.trim() || username,
    username,
    bio: null,
    genres: [],
    spotifyFollowers: null,
    spotifyPopularity: null,
    profileViews: 0,
    hasSocialLinks: false,
    hasMusicLinks: false,
    tippingStats: EMPTY_TIPPING_STATS,
  };
}

async function loadMobileArtistContextRow(
  profileId: string
): Promise<ArtistContext | null> {
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
      profileViews: creatorProfiles.profileViews,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!result?.username) {
    return null;
  }

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthISO = startOfMonth.toISOString();

  try {
    const [linkCounts, tipTotals, clickStats] = await Promise.all([
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
        .then(rows => rows[0]),
      db
        .select({
          totalReceived: drizzleSql<number>`COALESCE(SUM(${tips.amountCents}), 0)`,
          monthReceived: drizzleSql<number>`COALESCE(SUM(CASE WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp THEN ${tips.amountCents} ELSE 0 END), 0)`,
          tipsSubmitted: drizzleSql<number>`COALESCE(COUNT(${tips.id}), 0)`,
        })
        .from(tips)
        .where(eq(tips.creatorProfileId, profileId))
        .then(rows => rows[0]),
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
        .then(rows => rows[0]),
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
      profileViews: result.profileViews ?? 0,
      hasSocialLinks: Number(linkCounts?.totalActive ?? 0) > 0,
      hasMusicLinks: Number(linkCounts?.musicActive ?? 0) > 0,
      tippingStats: {
        tipClicks: Number(clickStats?.total ?? 0),
        tipsSubmitted: Number(tipTotals?.tipsSubmitted ?? 0),
        totalReceivedCents: Number(tipTotals?.totalReceived ?? 0),
        monthReceivedCents: Number(tipTotals?.monthReceived ?? 0),
      },
    };
  } catch (error) {
    logger.warn('Mobile artist context extras failed; using core identity', {
      profileId,
      error,
    });
    return {
      displayName: result.displayName ?? result.username,
      username: result.username,
      bio: result.bio,
      genres: result.genres ?? [],
      spotifyFollowers: result.spotifyFollowers,
      spotifyPopularity: result.spotifyPopularity,
      spotifyUrl: result.spotifyUrl,
      appleMusicUrl: result.appleMusicUrl,
      profileViews: result.profileViews ?? 0,
      hasSocialLinks: false,
      hasMusicLinks: false,
      tippingStats: EMPTY_TIPPING_STATS,
    };
  }
}

export async function fetchMobileArtistContext(input: {
  readonly profileId: string;
  readonly authorizedProfile?: AuthorizedArtistIdentity;
}): Promise<ArtistContext | null> {
  // Auth is the caller's job. handleMobileChatTurn already required a
  // session profile via getSessionContext (users.activeProfileId). A second
  // claims gate here 404'd Tim's live turns when the profile was linked
  // through activeProfileId but user_profile_claims lagged. If this extra
  // lookup misses, keep chatting with the session-authorized identity.
  try {
    const loaded = await loadMobileArtistContextRow(input.profileId);
    if (loaded) {
      return loaded;
    }
  } catch (error) {
    logger.warn('Mobile artist context row load failed', {
      profileId: input.profileId,
      error,
    });
  }

  return input.authorizedProfile
    ? artistContextFromAuthorizedProfile(input.authorizedProfile)
    : null;
}
