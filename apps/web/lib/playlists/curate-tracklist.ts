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
import { withTimeout } from '@/lib/resilience/primitives';
import type { CandidateTrack } from './discover-tracks';
import { extractJsonPayload } from './extract-json-payload';
import type { JovieArtistTrack } from './feature-jovie-artists';
import { buildCurationPrompt } from './prompts';

// ============================================================================
// Types
// ============================================================================

export interface CuratedTracklist {
  trackIds: string[];
  trackCount: number;
}

const CURATED_TRACK_IDS_SCHEMA = z.array(z.string()).min(10).max(50);
const ANTHROPIC_REQUEST_TIMEOUT_MS = 30_000;

export function parseTrackIdsFromResponseText(responseText: string): string[] {
  const jsonStr = extractJsonPayload(responseText);
  const parsed = JSON.parse(jsonStr);
  return CURATED_TRACK_IDS_SCHEMA.parse(parsed);
}

function createArtistLookup(
  candidates: CandidateTrack[],
  jovieArtistTracks: JovieArtistTrack[]
): Map<string, string> {
  const artistLookup = new Map<string, string>();
  for (const candidate of candidates) {
    artistLookup.set(candidate.id, candidate.artist);
  }
  for (const jovieTrack of jovieArtistTracks) {
    artistLookup.set(jovieTrack.spotifyTrackId, jovieTrack.artist);
  }
  return artistLookup;
}

export function dedupeTrackIdsByArtist(
  trackIds: string[],
  artistLookup: Map<string, string>
): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  let lastArtist = '';

  for (const id of trackIds) {
    if (seen.has(id)) continue;

    const artist = artistLookup.get(id) ?? '';
    if (artist === lastArtist && artist !== '') continue;

    seen.add(id);
    deduped.push(id);
    lastArtist = artist;
  }

  return deduped;
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
  const validIds = new Set([
    ...candidates.map(track => track.id),
    ...jovieArtistTracks.map(track => track.spotifyTrackId),
  ]);
  const artistLookup = createArtistLookup(candidates, jovieArtistTracks);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const message = await withTimeout(
        anthropic.messages.create(
          {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          },
          { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }
        ),
        {
          timeoutMs: ANTHROPIC_REQUEST_TIMEOUT_MS + 1_000,
          context: 'Anthropic curateTracklist',
        }
      );

      const textBlock = message.content.find(block => block.type === 'text');
      const responseText = textBlock?.type === 'text' ? textBlock.text : null;
      if (!responseText) {
        throw new Error('No text response from Claude');
      }

      const trackIds = parseTrackIdsFromResponseText(responseText);
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

      const deduped = dedupeTrackIdsByArtist(validatedIds, artistLookup);

      if (deduped.length < 10) {
        captureError('[Curate Tracklist] Too few tracks after dedupe', null, {
          requested: trackIds.length,
          valid: validatedIds.length,
          deduped: deduped.length,
          attempt,
        });
        continue;
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
