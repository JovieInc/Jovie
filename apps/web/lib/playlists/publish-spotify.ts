/**
 * Spotify Playlist Publisher
 *
 * Creates a public playlist on the Jovie Spotify account,
 * adds tracks in curated order, and uploads cover art.
 */

import 'server-only';
import { captureError } from '@/lib/error-tracking';
import { SPOTIFY_API_BASE } from '@/lib/spotify/env';
import {
  getJovieSpotifyToken,
  jovieSpotifyFetch,
  SpotifyApiError,
} from '@/lib/spotify/jovie-account';

// ============================================================================
// Types
// ============================================================================

export interface PublishResult {
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  tracksAdded: number;
  coverUploaded: boolean;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Create a playlist on Spotify, add tracks, and upload cover art.
 * Returns the Spotify playlist ID and URL.
 */
export async function publishToSpotify(options: {
  title: string;
  description: string;
  trackIds: string[];
  coverBase64: string;
  slug: string;
}): Promise<PublishResult> {
  const { title, description, trackIds, coverBase64, slug } = options;

  // Step 1: Create the playlist
  const playlistDescription = `${description}\n\nCurated by Jovie \u2022 jov.ie/playlists/${slug}`;

  const createResponse = await jovieSpotifyFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({
      name: title,
      description: playlistDescription,
      public: true,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new SpotifyApiError(
      `Failed to create playlist: ${error}`,
      createResponse.status,
      '/me/playlists'
    );
  }

  const playlist: { id: string; external_urls: { spotify: string } } =
    await createResponse.json();

  const spotifyPlaylistId = playlist.id;
  const spotifyPlaylistUrl = playlist.external_urls.spotify;

  // Step 2: Add tracks (Spotify allows max 100 per request)
  let tracksAdded = 0;

  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    const uris = batch.map(id => `spotify:track:${id}`);

    try {
      const addResponse = await jovieSpotifyFetch(
        `/playlists/${spotifyPlaylistId}/tracks`,
        {
          method: 'POST',
          body: JSON.stringify({ uris }),
        }
      );

      if (addResponse.ok) {
        tracksAdded += batch.length;
      } else {
        captureError('[Publish Spotify] Failed to add tracks batch', null, {
          playlistId: spotifyPlaylistId,
          batchStart: i,
          status: addResponse.status,
        });
      }
    } catch (error) {
      captureError('[Publish Spotify] Track batch error', error, {
        playlistId: spotifyPlaylistId,
        batchStart: i,
      });
    }
  }

  // Step 3: Upload cover art
  let coverUploaded = false;

  if (coverBase64) {
    try {
      const token = await getJovieSpotifyToken();

      const coverResponse = await fetch(
        `${SPOTIFY_API_BASE}/playlists/${spotifyPlaylistId}/images`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/jpeg',
          },
          body: coverBase64,
          signal: AbortSignal.timeout(15000),
        }
      );

      if (coverResponse.status === 202 || coverResponse.ok) {
        coverUploaded = true;
      } else {
        captureError('[Publish Spotify] Cover upload failed', null, {
          playlistId: spotifyPlaylistId,
          status: coverResponse.status,
        });
      }
    } catch (error) {
      captureError('[Publish Spotify] Cover upload error', error, {
        playlistId: spotifyPlaylistId,
      });
      // Non-fatal: playlist is still valid without custom cover
    }
  }

  return {
    spotifyPlaylistId,
    spotifyPlaylistUrl,
    tracksAdded,
    coverUploaded,
  };
}
