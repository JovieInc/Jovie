import 'server-only';

import { eq } from 'drizzle-orm';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  getConfirmedFeaturedPlaylistFallback,
  getDismissedPlaylistId,
  getFeaturedPlaylistFallbackCandidate,
} from '@/lib/profile/featured-playlist-fallback-data';
import { discoverThisIsPlaylistCandidate } from '@/lib/profile/featured-playlist-fallback-discovery';
import { PLAYLIST_SOURCE } from '@/lib/profile/featured-playlist-fallback-web';

export type { ConfirmedFeaturedPlaylistFallback } from '@/lib/profile/featured-playlist-fallback-data';
export {
  getConfirmedFeaturedPlaylistFallback,
  getFeaturedPlaylistFallbackCandidate,
} from '@/lib/profile/featured-playlist-fallback-data';

export async function refreshFeaturedPlaylistFallbackCandidate(input: {
  readonly profileId: string;
  readonly usernameNormalized: string;
  readonly artistName: string;
  readonly artistSpotifyId: string;
}): Promise<void> {
  if (!input.artistSpotifyId.trim()) {
    return;
  }

  const [profile] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.profileId))
    .limit(1);

  if (!profile) {
    return;
  }

  const currentSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const currentCandidate =
    getFeaturedPlaylistFallbackCandidate(currentSettings);
  const currentConfirmed =
    getConfirmedFeaturedPlaylistFallback(currentSettings);
  const dismissedPlaylistId = getDismissedPlaylistId(currentSettings);

  const discoveredCandidate = await discoverThisIsPlaylistCandidate({
    artistName: input.artistName,
    artistSpotifyId: input.artistSpotifyId,
  });

  let nextSettings: Record<string, unknown> | null = null;

  if (!discoveredCandidate) {
    if (currentCandidate?.source === PLAYLIST_SOURCE) {
      nextSettings = {
        ...currentSettings,
        featuredPlaylistFallbackCandidate: null,
      };
    }
  } else if (dismissedPlaylistId === discoveredCandidate.playlistId) {
    return;
  } else if (currentConfirmed) {
    if (currentCandidate) {
      nextSettings = {
        ...currentSettings,
        featuredPlaylistFallbackCandidate: null,
      };
    }
  } else {
    nextSettings = {
      ...currentSettings,
      featuredPlaylistFallbackCandidate: discoveredCandidate,
    };
  }

  if (
    !nextSettings ||
    JSON.stringify(nextSettings) === JSON.stringify(currentSettings)
  ) {
    return;
  }

  try {
    await db
      .update(creatorProfiles)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, input.profileId));
    await invalidateProfileCache(input.usernameNormalized);
  } catch (error) {
    await captureError(
      'Failed to refresh featured playlist fallback candidate',
      error,
      {
        profileId: input.profileId,
        route: 'featured-playlist-fallback',
        usernameNormalized: input.usernameNormalized,
      }
    );
  }
}
