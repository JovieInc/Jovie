import 'server-only';

import { getProfileAndLinks } from '@/app/[username]/_lib/public-profile-loader';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import { getLiveMerchCardsForProfile } from '@/lib/merch/service';
import { getCachedPublicReleasesForProfile } from '@/lib/releases/public-release-loader';
import { getUpcomingTourDatesForProfile } from '@/lib/tour-dates/queries';
import { toISOStringOrNull, toISOStringSafe } from '@/lib/utils/date';
import type { AskJovieContextNeeds, AskJovieProfileContext } from './answer';

export interface AskJovieProfileLoad {
  readonly context: AskJovieProfileContext | null;
  readonly creatorProfileId: string | null;
}

/**
 * Load the grounded public context Ask Jovie answers from. Everything here is
 * already public profile data — no private fields leave the loaders.
 */
export async function loadAskJovieContext(
  username: string,
  needs: AskJovieContextNeeds = { releases: true, tourDates: true }
): Promise<AskJovieProfileLoad> {
  const result = await getProfileAndLinks(username);
  if (!result.profile) {
    return { context: null, creatorProfileId: null };
  }

  const { profile } = result;
  const [releases, tourDates, merch] = await Promise.all([
    needs.releases
      ? getCachedPublicReleasesForProfile(profile.id).catch(() => [])
      : Promise.resolve([]),
    needs.tourDates
      ? getUpcomingTourDatesForProfile(profile.id).catch(() => [])
      : Promise.resolve([]),
    needs.merch
      ? getLiveMerchCardsForProfile(profile.id).catch(() => [])
      : Promise.resolve([]),
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
        id: release.id,
        title: release.title,
        releaseType: release.releaseType,
        releaseDate: toISOStringOrNull(release.releaseDate),
        slug: release.slug,
        artworkUrl: release.artworkUrl,
        artistNames: release.artistNames,
      })),
      latestRelease:
        needs.releases && result.latestRelease
          ? {
              ...result.latestRelease,
              // unstable_cache JSON round-trips Dates into strings — normalize
              // defensively so a warm cache never yields a bare string here.
              releaseDate: toISOStringOrNull(result.latestRelease.releaseDate),
            }
          : null,
      tourDates: tourDates.map(show => ({
        id: show.id,
        title: show.title,
        startDate: toISOStringSafe(show.startDate),
        venueName: show.venueName,
        city: show.city,
        region: show.region,
        country: show.country,
        timezone: show.timezone,
        ticketUrl: show.ticketUrl,
        ticketStatus: show.ticketStatus,
      })),
      links: result.links
        .filter(link => link.is_visible !== false)
        .map(link => ({ platform: link.platform, url: link.url })),
      merch,
      contacts: result.contacts
        .filter(
          contact =>
            contact.isActive !== false &&
            Boolean(contact.email || contact.phone)
        )
        .map(contact => ({
          id: contact.id,
          roleLabel: getContactRoleLabel(contact.role, contact.customLabel),
          contactName: contact.personName,
          companyLabel: contact.companyName,
        })),
    },
  };
}
