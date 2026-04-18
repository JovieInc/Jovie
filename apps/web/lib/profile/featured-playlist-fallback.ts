import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { discoverThisIsPlaylistCandidate } from '@/lib/profile/featured-playlist-fallback-discovery';
import {
  type FeaturedPlaylistFallbackCandidate,
  PLAYLIST_SOURCE,
} from '@/lib/profile/featured-playlist-fallback-web';

const featuredPlaylistFallbackCandidateSchema = z.object({
  playlistId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  imageUrl: z.string().url().nullable(),
  artistSpotifyId: z.string().min(1),
  source: z.literal(PLAYLIST_SOURCE),
  discoveredAt: z.string().datetime(),
  searchQuery: z.string().min(1),
});

const confirmedFeaturedPlaylistFallbackSchema =
  featuredPlaylistFallbackCandidateSchema.extend({
    confirmedAt: z.string().datetime(),
  });

export type ConfirmedFeaturedPlaylistFallback = z.infer<
  typeof confirmedFeaturedPlaylistFallbackSchema
>;

function getDismissedPlaylistId(
  settings: Record<string, unknown> | null | undefined
): string | null {
  const dismissedId = settings?.featuredPlaylistFallbackDismissedId;
  return typeof dismissedId === 'string' && dismissedId.trim().length > 0
    ? dismissedId
    : null;
}

export function getFeaturedPlaylistFallbackCandidate(
  settings: Record<string, unknown> | null | undefined
): FeaturedPlaylistFallbackCandidate | null {
  const parsed = featuredPlaylistFallbackCandidateSchema.safeParse(
    settings?.featuredPlaylistFallbackCandidate
  );
  return parsed.success ? parsed.data : null;
}

export function getConfirmedFeaturedPlaylistFallback(
  settings: Record<string, unknown> | null | undefined
): ConfirmedFeaturedPlaylistFallback | null {
  const parsed = confirmedFeaturedPlaylistFallbackSchema.safeParse(
    settings?.featuredPlaylistFallback
  );
  return parsed.success ? parsed.data : null;
}

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
