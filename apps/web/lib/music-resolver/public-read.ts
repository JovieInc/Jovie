import 'server-only';

import { z } from 'zod';
import { type InHouseQuery, resolveInHouse } from './in-house';
import { createDefaultInHouseSources } from './in-house-sources';

export const musicResolveSchema = z
  .object({
    kind: z.enum(['artist', 'track', 'album']).default('artist'),
    input: z.string().trim().min(1).max(500),
    artist: z.string().trim().min(1).max(200).optional(),
    territory: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
  })
  .strict();

const nullableText = z.string().nullable();
const artistMetadataSchema = z
  .object({
    source: z.literal('musicbrainz'),
    sourceUrl: z.url(),
    disambiguation: nullableText,
    aliases: z.array(z.string()),
    type: nullableText,
    country: nullableText,
    area: nullableText,
    origin: nullableText,
    isnis: z.array(z.string()),
    ipis: z.array(z.string()),
    wikidataIds: z.array(z.string()),
    externalLinks: z.array(
      z
        .object({
          provider: nullableText,
          url: z.url(),
          relationship: z.string(),
          provenance: z.literal('musicbrainz_url_rel'),
        })
        .strict()
    ),
    releaseGroups: z.array(
      z
        .object({
          mbid: z.string(),
          title: z.string(),
          primaryType: nullableText,
          firstReleaseDate: nullableText,
        })
        .strict()
    ),
    releaseGroupsComplete: z.boolean(),
  })
  .strict();

export const musicResolveOutputSchema = z
  .object({
    status: z.enum(['resolved', 'no_match', 'ambiguous', 'upstream_error']),
    kind: z.enum(['artist', 'track', 'album']),
    title: nullableText,
    artist: nullableText,
    isrc: nullableText,
    upc: nullableText,
    mbid: nullableText,
    links: z.array(
      z
        .object({
          provider: z.string(),
          url: z.url(),
          provenance: z.string(),
          confidence: z.number().min(0).max(1),
        })
        .strict()
    ),
    candidates: z.array(
      z
        .object({ title: z.string(), artist: nullableText, url: z.url() })
        .strict()
    ),
    confidence: z.number().min(0).max(1),
    provenance: z.record(z.string(), z.string()),
    candidateCount: z.number().int().nonnegative(),
    artistMetadata: artistMetadataSchema.optional(),
    sourceErrors: z
      .array(
        z
          .object({
            source: z.enum(['catalog_isrc', 'musicbrainz_isrc']),
            code: z.literal('UPSTREAM_FAILURE'),
            retryable: z.boolean(),
          })
          .strict()
      )
      .max(2)
      .optional(),
  })
  .strict();

export function musicResolveQuery(
  input: z.infer<typeof musicResolveSchema>
): InHouseQuery | null {
  const { kind, artist, territory } = input;
  const value = input.input;
  const market = territory?.toUpperCase();
  if (kind === 'artist' && (artist || territory)) return null;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.username || url.password || url.port || url.protocol !== 'https:')
      return null;
    return kind === 'artist'
      ? { kind, url: url.href }
      : kind === 'track'
        ? { kind, url: url.href, territory: market }
        : { kind, url: url.href, territory: market };
  }
  // Reject URL-like inputs rather than searching credentials, schemes, or hosts as names.
  if (/^[a-z][a-z0-9+.-]*:|^[^\s]+\.[a-z]{2,}(?:\/|$)/i.test(value))
    return null;
  if (kind === 'artist') {
    return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
      ? { kind, mbid: value.toLowerCase() }
      : value.length <= 200
        ? { kind, name: value }
        : null;
  }
  const isrc = value.replace(/-/g, '').toUpperCase();
  if (kind === 'track' && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))
    return { kind, isrc, territory: market };
  if (kind === 'album' && /^\d{12,14}$/.test(value))
    return { kind, upc: value, territory: market };
  if (!artist) return null;
  return kind === 'track'
    ? { kind, artist, title: value, territory: market }
    : { kind, artist, title: value, territory: market };
}

export async function resolvePublicMusic(
  input: z.infer<typeof musicResolveSchema>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = musicResolveQuery(input);
  if (!query) return { error: { code: 'INVALID_INPUT', retryable: false } };
  if (signal?.aborted)
    return { error: { code: 'CANCELLED', retryable: false } };
  const result = await resolveInHouse(
    query,
    createDefaultInHouseSources(signal)
  );
  if (signal?.aborted)
    return { error: { code: 'CANCELLED', retryable: false } };
  if (result.status === 'upstream_error')
    return { error: { code: 'UPSTREAM_FAILURE', retryable: true } };
  return musicResolveOutputSchema.parse(result);
}
