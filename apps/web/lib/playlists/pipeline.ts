/**
 * Playlist Generation Pipeline Orchestrator
 *
 * Single entry point that coordinates the full playlist generation flow:
 *   1. Check compliance (should we generate today?)
 *   2. Generate concept (Claude Haiku)
 *   3. Discover tracks (Spotify Search)
 *   4. Find matching Jovie artists
 *   5. Curate tracklist (Claude Sonnet)
 *   6. Generate cover art (Sharp + Unsplash)
 *   7. Save to database as "pending" (for admin approval)
 *
 * Publishing to Spotify happens separately after admin approval.
 */

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db';
import { joviePlaylists, joviePlaylistTracks } from '@/lib/db/schema/playlists';
import { captureError } from '@/lib/error-tracking';
import {
  generatePlaylistSlug,
  getTargetPlaylistSize,
  shouldGenerateToday,
} from './compliance';
import { curateTracklist } from './curate-tracklist';
import { type CandidateTrack, discoverTracks } from './discover-tracks';
import { findMatchingJovieArtistTracks } from './feature-jovie-artists';
import { generatePlaylistConcept } from './generate-concept';

// ============================================================================
// Types
// ============================================================================

export interface PipelineResult {
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  playlistId?: string;
  title?: string;
  trackCount?: number;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Run the full playlist generation pipeline.
 * Creates a playlist in "pending" status for admin review.
 */
export async function generatePlaylist(): Promise<PipelineResult> {
  const startTime = Date.now();

  try {
    // Step 1: Compliance check
    const shouldGenerate = await shouldGenerateToday();
    if (!shouldGenerate) {
      return {
        success: true,
        skipped: true,
        skipReason: 'Compliance cadence check: skipping today',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Generate concept
    const concept = await generatePlaylistConcept();

    // Step 3: Discover tracks from Spotify
    const targetSize = getTargetPlaylistSize();
    const candidates = await discoverTracks(concept.trackQueries, {
      maxCandidates: targetSize * 3, // 3x candidates for curation selection
    });

    if (candidates.length < 10) {
      return {
        success: false,
        error: `Insufficient tracks found (${candidates.length}). Need at least 10.`,
        title: concept.title,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 4: Find matching Jovie artists
    const jovieArtistTracks = await findMatchingJovieArtistTracks({
      genreTags: concept.genreTags,
      moodTags: concept.moodTags,
    });

    // Step 5: LLM curation
    const curated = await curateTracklist({
      concept: {
        title: concept.title,
        description: concept.description,
        moodTags: concept.moodTags,
      },
      candidates,
      jovieArtistTracks,
      targetSize,
    });

    // Cover art is generated at approval time (admin page), not here.
    // The unsplashQuery and coverTextWords are persisted in llmPrompt for later use.

    // Step 6: Save to database
    const slug = generatePlaylistSlug(concept.title);

    // Build track lookup for metadata
    const trackLookup = new Map<string, CandidateTrack>();
    for (const c of candidates) trackLookup.set(c.id, c);

    const jovieTrackLookup = new Map<
      string,
      (typeof jovieArtistTracks)[number]
    >();
    for (const j of jovieArtistTracks)
      jovieTrackLookup.set(j.spotifyTrackId, j);

    // TODO: Upload fullResBuffer to CDN and get URL
    // For now, we'll store the cover art URL after Spotify upload
    const coverImageUrl = null;

    const [playlist] = await db
      .insert(joviePlaylists)
      .values({
        title: concept.title,
        description: concept.description,
        slug,
        theme: concept.title,
        genreTags: concept.genreTags,
        moodTags: concept.moodTags,
        trackCount: curated.trackCount,
        coverImageUrl,
        editorialNote: concept.editorialNote,
        llmPrompt: JSON.stringify({
          concept: concept.title,
          genreTags: concept.genreTags,
          candidateCount: candidates.length,
          jovieArtistCount: jovieArtistTracks.length,
          unsplashQuery: concept.unsplashQuery,
          coverTextWords: concept.coverTextWords,
        }),
        llmModel: 'haiku+sonnet',
        status: 'pending',
        statusChangedAt: new Date(),
      })
      .returning({ id: joviePlaylists.id });

    if (!playlist) {
      throw new Error('Failed to insert playlist into database');
    }

    // Insert tracks
    const trackInserts = curated.trackIds.map((trackId, index) => {
      const candidate = trackLookup.get(trackId);
      const jovieTrack = jovieTrackLookup.get(trackId);

      return {
        playlistId: playlist.id,
        spotifyTrackId: trackId,
        position: index + 1,
        artistName: jovieTrack?.artist ?? candidate?.artist ?? 'Unknown Artist',
        trackName: candidate?.name ?? jovieTrack?.name ?? 'Unknown Track',
        spotifyArtistId: candidate?.artistId ?? null,
        jovieProfileId: jovieTrack?.artistProfileId ?? null,
        isJovieArtist: !!jovieTrack,
      };
    });

    if (trackInserts.length > 0) {
      await db.insert(joviePlaylistTracks).values(trackInserts);
    }

    // Store cover art base64 temporarily for publish step
    // In production, this would go to a CDN/blob store
    // For now, we'll regenerate at publish time

    return {
      success: true,
      playlistId: playlist.id,
      title: concept.title,
      trackCount: curated.trackCount,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    captureError('[Playlist Pipeline] Generation failed', error);
    Sentry.captureException(error, {
      tags: { component: 'playlist-pipeline' },
    });

    return {
      success: false,
      error: msg,
      durationMs: Date.now() - startTime,
    };
  }
}
