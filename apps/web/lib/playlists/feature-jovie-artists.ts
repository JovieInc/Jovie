/**
 * Jovie Artist Feature Matching
 *
 * Finds tracks from Jovie-registered artists that fit a playlist theme.
 * Matches by Spotify genre tags against the playlist's genre/mood tags.
 */

import 'server-only';
import { and, sql as drizzleSql, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { jovieSpotifyFetch } from '@/lib/spotify/jovie-account';

// ============================================================================
// Types
// ============================================================================

export interface JovieArtistTrack {
  spotifyTrackId: string;
  name: string;
  artist: string;
  artistProfileId: string;
  artistUsername: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Find tracks from Jovie artists that match the playlist theme.
 * Returns 0-5 tracks. Returns empty array if no matches (that's fine).
 */
export async function findMatchingJovieArtistTracks(options: {
  genreTags: string[];
  moodTags: string[];
  maxTracks?: number;
}): Promise<JovieArtistTrack[]> {
  const { maxTracks = 5 } = options;

  try {
    // Find Jovie profiles that have Spotify IDs and matching genres
    // We query profiles with spotifyId, then check their top tracks
    const profiles = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        spotifyId: creatorProfiles.spotifyId,
      })
      .from(creatorProfiles)
      .where(
        and(
          isNotNull(creatorProfiles.spotifyId),
          drizzleSql`${creatorProfiles.spotifyId} != ''`
        )
      )
      .limit(50);

    if (profiles.length === 0) return [];

    // For each profile, fetch their top tracks from Spotify
    const results: JovieArtistTrack[] = [];

    for (const profile of profiles) {
      if (results.length >= maxTracks) break;
      if (!profile.spotifyId) continue;

      try {
        const response = await jovieSpotifyFetch(
          `/artists/${profile.spotifyId}/top-tracks?market=US`
        );

        if (!response.ok) continue;

        const data: {
          tracks: Array<{
            id: string;
            name: string;
            popularity: number;
            artists: Array<{ name: string }>;
          }>;
        } = await response.json();

        // Pick the most popular track that hasn't been added yet
        const bestTrack = data.tracks
          .filter(t => t.popularity > 10)
          .sort((a, b) => b.popularity - a.popularity)[0];

        if (bestTrack) {
          results.push({
            spotifyTrackId: bestTrack.id,
            name: bestTrack.name,
            artist: bestTrack.artists[0]?.name ?? profile.displayName ?? '',
            artistProfileId: profile.id,
            artistUsername: profile.username ?? '',
          });
        }
      } catch {
        // Skip this artist, continue with others
      }
    }

    return results;
  } catch (error) {
    captureError('[Feature Jovie Artists] Query failed', error);
    return [];
  }
}
