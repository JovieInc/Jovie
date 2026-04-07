/**
 * LLM Track Curation
 *
 * Uses Claude Sonnet to sequence candidate tracks into a cohesive playlist.
 * The LLM handles energy arc, key compatibility, and genre coherence.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import type { CandidateTrack } from './discover-tracks';
import type { JovieArtistTrack } from './feature-jovie-artists';
import { buildCurationPrompt } from './prompts';

// ============================================================================
// Types
// ============================================================================

export interface CuratedTracklist {
  trackIds: string[];
  trackCount: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Use Claude Sonnet to curate and sequence a playlist from candidate tracks.
 * Returns ordered track IDs ready for Spotify playlist creation.
 */
export async function curateTracklist(options: {
  concept: { title: string; description: string; moodTags: string[] };
  candidates: CandidateTrack[];
  jovieArtistTracks: JovieArtistTrack[];
  targetSize: number;
}): Promise<CuratedTracklist> {
  const { concept, candidates, jovieArtistTracks, targetSize } = options;

  if (candidates.length < 10) {
    throw new Error(
      `Not enough candidate tracks (${candidates.length}). Need at least 10.`
    );
  }

  const prompt = buildCurationPrompt({
    concept,
    candidateTracks: candidates.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artist,
      popularity: t.popularity,
    })),
    jovieArtistTracks: jovieArtistTracks.map(t => ({
      spotifyTrackId: t.spotifyTrackId,
      name: t.name,
      artist: t.artist,
    })),
    targetSize,
  });

  const anthropic = new Anthropic();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = message.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      // Extract JSON array from response
      let jsonStr = textBlock.text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1]!.trim();
      }

      const parsed = JSON.parse(jsonStr);
      const trackIds = z.array(z.string()).min(10).max(50).parse(parsed);

      // Validate all IDs are from our candidates or Jovie artists
      const validIds = new Set([
        ...candidates.map(t => t.id),
        ...jovieArtistTracks.map(t => t.spotifyTrackId),
      ]);

      const validatedIds = trackIds.filter(id => validIds.has(id));

      if (validatedIds.length < 10) {
        captureError(
          '[Curate Tracklist] Too few valid tracks after filter',
          null,
          {
            requested: trackIds.length,
            valid: validatedIds.length,
            attempt,
          }
        );
        continue;
      }

      // Enforce no back-to-back same artist (use artist name for consistent comparison)
      const artistLookup = new Map<string, string>();
      for (const c of candidates) artistLookup.set(c.id, c.artist);
      for (const j of jovieArtistTracks)
        artistLookup.set(j.spotifyTrackId, j.artist);

      const deduped: string[] = [];
      let lastArtist = '';

      for (const id of validatedIds) {
        const artist = artistLookup.get(id) ?? '';
        if (artist === lastArtist && artist !== '') continue;
        deduped.push(id);
        lastArtist = artist;
      }

      return {
        trackIds: deduped,
        trackCount: deduped.length,
      };
    } catch (error) {
      captureError('[Curate Tracklist] Curation failed', error, { attempt });
      if (attempt === 2) throw error;
    }
  }

  throw new Error('Failed to curate tracklist after 3 attempts');
}
