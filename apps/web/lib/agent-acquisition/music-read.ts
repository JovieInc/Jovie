import 'server-only';

import { z } from 'zod';
import { parseAgentArtistInput } from './artist-input';
import {
  type PublicArtistSnapshot,
  resolveAgentArtist,
} from './artist-resolution';

// Shared domain schemas, consumed directly by the MCP SDK. No parallel JSON
// schema, credential arguments, acquisition tracking, or draft capabilities.
export const musicSearchSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .regex(/\S/)
      .describe(
        'Artist name (Spotify search), provider-qualified artist ID, or Spotify/Apple Music artist HTTPS URL. Names return candidates, never a verified match.'
      ),
  })
  .strict();
export const musicFetchSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^(?:spotify:[A-Za-z0-9]{22}|apple_music:[1-9]\d{0,19}|https:\/\/music\.apple\.com\/[a-z]{2}\/artist\/[1-9]\d{0,19})$/
      )
      .describe(
        'Exact id returned by search: qualified Spotify ID or canonical Apple artist URL retaining storefront.'
      ),
  })
  .strict();

const provenanceSchema = z
  .object({
    source: z.literal('jovie-canonical-artist-resolver'),
    provider: z.enum(['spotify', 'apple_music']),
    external_id: z.string(),
    source_url: z.url(),
    identity: z.enum(['candidate', 'exact_provider_id']),
    cross_provider_identity: z.literal('unverified'),
  })
  .strict();
export const musicReadErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          'INVALID_INPUT',
          'UNSUPPORTED_INPUT',
          'ARTIST_NOT_FOUND',
          'UPSTREAM_FAILURE',
          'UPSTREAM_TIMEOUT',
          'CANCELLED',
          'UNKNOWN_TOOL',
        ]),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

const musicSearchSuccessSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            url: z.url(),
            metadata: provenanceSchema,
          })
          .strict()
      )
      .max(5),
  })
  .strict();
const musicFetchSuccessSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
    url: z.url(),
    metadata: provenanceSchema,
  })
  .strict();

export const musicSearchOutputSchema = z.union([
  musicSearchSuccessSchema,
  musicReadErrorSchema,
]);
export const musicFetchOutputSchema = z.union([
  musicFetchSuccessSchema,
  musicReadErrorSchema,
]);

const provenance = (
  artist: PublicArtistSnapshot,
  identity: 'candidate' | 'exact_provider_id'
) => ({
  source: 'jovie-canonical-artist-resolver',
  provider: artist.provider,
  external_id: artist.external_id,
  source_url: artist.source_url,
  identity,
  cross_provider_identity: 'unverified',
});

export async function searchMusicArtists(
  input: z.infer<typeof musicSearchSchema>,
  signal?: AbortSignal
) {
  const { query } = musicSearchSchema.parse(input);
  const result = await resolveAgentArtist({ input: query }, signal);
  if (result.status === 'error') {
    if (result.code === 'ARTIST_NOT_FOUND') return { results: [] };
    return { error: { code: result.code, retryable: result.retryable } };
  }
  const exact = result.status === 'resolved';
  const artists = exact ? [result.artist] : result.candidates;
  return {
    results: artists.map(artist => ({
      id:
        artist.provider === 'apple_music'
          ? artist.source_url
          : artist.artist_id,
      title: artist.display_name,
      url: artist.source_url,
      metadata: provenance(artist, exact ? 'exact_provider_id' : 'candidate'),
    })),
  };
}

export async function fetchMusicArtist(
  input: z.infer<typeof musicFetchSchema>,
  signal?: AbortSignal
) {
  const { id } = musicFetchSchema.parse(input);
  // Defense in depth: fetching can never fall back to a name search.
  const parsed = parseAgentArtistInput({ input: id });
  if (parsed.kind !== 'exact') {
    return { error: { code: 'INVALID_INPUT', retryable: false } };
  }
  const result = await resolveAgentArtist({ input: id }, signal);
  if (result.status === 'error')
    return { error: { code: result.code, retryable: result.retryable } };
  if (
    result.status !== 'resolved' ||
    result.artist.provider !== parsed.provider ||
    result.artist.external_id !== parsed.id
  ) {
    return { error: { code: 'UPSTREAM_FAILURE', retryable: true } };
  }
  const artist = result.artist;
  return {
    id,
    title: artist.display_name,
    text: JSON.stringify(artist),
    url: artist.source_url,
    metadata: provenance(artist, 'exact_provider_id'),
  };
}
