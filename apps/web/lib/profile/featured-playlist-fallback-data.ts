import { z } from 'zod';
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

export function getDismissedPlaylistId(
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
