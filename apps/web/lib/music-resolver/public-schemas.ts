import { z } from 'zod';

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
export const coreArtistMetadataSchema = z
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
    artistMetadata: coreArtistMetadataSchema.optional(),
  })
  .strict();
