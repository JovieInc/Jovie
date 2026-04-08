/**
 * Playlist Generation Cron Job
 *
 * Daily cron that generates a new playlist concept, discovers tracks,
 * curates the tracklist, generates cover art, and saves to the database
 * as "pending" for admin review.
 *
 * Schedule: daily at 6 AM UTC (configured in vercel.json)
 * Max duration: 120 seconds (LLM calls + Spotify searches + image gen)
 */

import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { generatePlaylist } from '@/lib/playlists/pipeline';
import { checkJovieSpotifyHealth } from '@/lib/spotify/jovie-account';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  // Auth check
  const authError = verifyCronRequest(request, {
    route: '/api/cron/generate-playlist',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  // Feature flag check
  if (!FEATURE_FLAGS.PLAYLIST_ENGINE) {
    return NextResponse.json(
      { success: true, skipped: true, reason: 'PLAYLIST_ENGINE flag is off' },
      { headers: NO_STORE }
    );
  }

  // OAuth health check
  const spotifyHealthy = await checkJovieSpotifyHealth();
  if (!spotifyHealthy) {
    captureError(
      '[Playlist Cron] Spotify OAuth health check failed. Skipping generation.',
      null
    );
    return NextResponse.json(
      {
        success: false,
        error:
          'Spotify OAuth health check failed. Re-link Spotify in admin settings.',
      },
      { status: 503, headers: NO_STORE }
    );
  }

  // Run the pipeline
  const result = await generatePlaylist();

  return NextResponse.json(
    {
      success: result.success,
      skipped: result.skipped,
      skipReason: result.skipReason,
      playlistId: result.playlistId,
      title: result.title,
      trackCount: result.trackCount,
      error: result.error,
      durationMs: result.durationMs,
    },
    {
      status: result.success ? 200 : 500,
      headers: NO_STORE,
    }
  );
}
