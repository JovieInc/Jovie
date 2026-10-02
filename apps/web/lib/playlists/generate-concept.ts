/**
 * Playlist Concept Generation
 *
 * Uses the lightweight gateway model to generate hyper-niche playlist concepts.
 * Each concept includes: title, description, track suggestions,
 * genre/mood tags, and cover art direction.
 */

import 'server-only';
import { count, desc } from 'drizzle-orm';
import { z } from 'zod';
import { gateway, generateText } from '@/lib/ai/sdk';
import { CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { captureError } from '@/lib/error-tracking';
import { withTimeout } from '@/lib/resilience/primitives';
import { extractJsonPayload } from './extract-json-payload';
import { buildConceptPrompt } from './prompts';

// ============================================================================
// Types
// ============================================================================

export const PlaylistConceptSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(500),
  editorialNote: z.string().min(100).max(2000),
  genreTags: z.array(z.string()).min(1).max(5),
  moodTags: z.array(z.string()).min(1).max(5),
  trackQueries: z.array(z.string()).min(15).max(50),
  unsplashQuery: z.string().min(2).max(50),
  coverTextWords: z.string().min(1).max(30),
});

export type PlaylistConcept = z.infer<typeof PlaylistConceptSchema>;

// ============================================================================
// Genre Rotation
// ============================================================================

const GENRE_ROTATION = [
  'indie rock',
  'electronic',
  'hip hop',
  'R&B / soul',
  'pop',
  'folk / acoustic',
  'jazz',
  'classical / ambient',
  'latin',
  'alternative',
  'punk / post-punk',
  'country / americana',
  'synthwave / retrowave',
  'lo-fi / chillhop',
] as const;

const CATEGORY_ROTATION: Array<'general' | 'soundtrack' | 'cultural'> = [
  'general',
  'general',
  'soundtrack',
  'general',
  'cultural',
  'general',
  'general',
];

const REQUEST_TIMEOUT_MS = 30_000;

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a new playlist concept using the lightweight gateway model.
 * Deduplicates against existing playlist titles in the database.
 */
export async function generatePlaylistConcept(options?: {
  genreFocus?: string;
  category?: 'general' | 'soundtrack' | 'cultural';
}): Promise<PlaylistConcept> {
  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(joviePlaylists);

  // Get previous titles for deduplication (last 50)
  const existingPlaylists = await db
    .select({ title: joviePlaylists.title })
    .from(joviePlaylists)
    .orderBy(desc(joviePlaylists.createdAt))
    .limit(50);

  const previousTitles = existingPlaylists.map(p => p.title);

  // Determine genre and category from rotation if not specified
  const playlistCount = Number(totalCount ?? 0);
  const genreFocus =
    options?.genreFocus ??
    GENRE_ROTATION[playlistCount % GENRE_ROTATION.length];
  const category =
    options?.category ??
    CATEGORY_ROTATION[playlistCount % CATEGORY_ROTATION.length];

  const prompt = buildConceptPrompt({
    previousTitles,
    genreFocus,
    category,
    seed: Date.now() % 10000,
  });

  // Try up to 3 times to get a valid concept
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await withTimeout(
        generateText({
          model: gateway(CHAT_MODEL_LIGHT),
          maxOutputTokens: 2000,
          prompt,
        }),
        {
          timeoutMs: REQUEST_TIMEOUT_MS + 1_000,
          context: 'generatePlaylistConcept',
        }
      );

      if (!result.text) {
        throw new Error('No text response from model');
      }

      const jsonStr = extractJsonPayload(result.text);
      const parsed = JSON.parse(jsonStr);
      const concept = PlaylistConceptSchema.parse(parsed);

      // Check title isn't a duplicate
      if (
        previousTitles.some(
          t => t.toLowerCase() === concept.title.toLowerCase()
        )
      ) {
        captureError('[Playlist Concept] Duplicate title generated', null, {
          title: concept.title,
          attempt,
        });
        continue;
      }

      return concept;
    } catch (error) {
      captureError('[Playlist Concept] Generation failed', error, { attempt });
      if (attempt === 2) throw error;
    }
  }

  throw new Error('Failed to generate playlist concept after 3 attempts');
}
