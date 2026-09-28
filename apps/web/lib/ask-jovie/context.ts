import 'server-only';

import { getProfileAndLinks } from '@/app/[username]/_lib/public-profile-loader';
import { getCachedPublicReleasesForProfile } from '@/lib/releases/public-release-loader';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import { toISOStringOrNull } from '@/lib/utils/date';
import type { AskJovieProfileContext } from './answer';

export interface AskJovieProfileLoad {
  readonly context: AskJovieProfileContext | null;
  readonly creatorProfileId: string | null;
}

/**
 * Load the grounded public context Ask Jovie answers from. Everything here is
 * already public profile data — no private fields leave the loaders.
 */
export async function loadAskJovieContext(
  username: string
): Promise<AskJovieProfileLoad> {
  const result = await getProfileAndLinks(username);
  if (!result.profile) {
    return { context: null, creatorProfileId: null };
  }

  const { profile } = result;
  const [releases, tourDates] = await Promise.all([
    getCachedPublicReleasesForProfile(profile.id).catch(() => []),
    getUpcomingTourDatesForProfile(profile.id).catch(() => []),
  ]);

  return {
    creatorProfileId: profile.id,
    context: {
      username: profile.username,
      displayName: profile.display_name ?? profile.username,
      bio: profile.bio,
      location: profile.location,
      genres: result.genres ?? profile.genres,
      releases: releases.map(release => ({
        title: release.title,
        releaseType: release.releaseType,
        releaseDate: release.releaseDate,
        slug: release.slug,
      })),
      latestRelease: result.latestRelease
        ? {
            ...result.latestRelease,
            releaseDate: toISOStringOrNull(result.latestRelease.releaseDate),
          }
        : null,
      tourDates: tourDates.map(show => ({
        startDate: show.startDate,
        venueName: show.venueName,
        city: show.city,
        region: show.region,
        country: show.country,
      })),
      links: result.links
        .filter(link => link.is_visible !== false)
        .map(link => ({ platform: link.platform, url: link.url })),
    },
  };
}
